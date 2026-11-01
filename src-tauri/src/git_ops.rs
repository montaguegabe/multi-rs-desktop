//! Host-side git writes and external-tool launches for the desktop app:
//! staging, committing, pushing, discarding, and opening repos in other
//! tools. All git access shells out to `git`, like `multi-core`.

use std::path::{Path, PathBuf};
use std::process::{Command, Output, Stdio};
use std::time::Duration;

use multi_core::app_api::{RepoStatus, get_repo_status};
use multi_core::git::{git_output_timeout, run_git_with_input, stderr_string, stdout_string};
use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;

use crate::paths::basename;
use crate::tasks::blocking;

const DEFAULT_TIMEOUT: Duration = Duration::from_secs(30);
const PUSH_TIMEOUT: Duration = Duration::from_secs(120);
/// Commits run the repository's hooks (linters, test suites), which can take
/// far longer than a plain git command; killing them mid-run would leave a
/// half-written index or hook caches behind.
const COMMIT_TIMEOUT: Duration = Duration::from_secs(600);

/// A failed git invocation with everything the user may need to see.
#[derive(Debug)]
struct GitFailure {
    stdout: String,
    stderr: String,
    code: Option<i32>,
    message: String,
}

impl GitFailure {
    fn text(&self) -> String {
        let mut parts: Vec<String> = Vec::new();
        for part in [&self.stderr, &self.stdout, &self.message] {
            let trimmed = part.trim();
            if !trimmed.is_empty() && !parts.iter().any(|p| p == trimmed) {
                parts.push(trimmed.to_string());
            }
        }
        if parts.is_empty() {
            "Unknown git error".to_string()
        } else {
            parts.join("\n")
        }
    }

    fn lower(&self) -> String {
        self.text().to_lowercase()
    }
}

fn git(cwd: &Path, args: &[&str], timeout: Duration) -> Result<Output, GitFailure> {
    match git_output_timeout(cwd, args, timeout) {
        Ok(Some(output)) if output.status.success() => Ok(output),
        Ok(Some(output)) => Err(GitFailure {
            stdout: stdout_string(&output),
            stderr: stderr_string(&output),
            code: output.status.code(),
            message: format!("Command failed: git {}", args.join(" ")),
        }),
        Ok(None) => Err(GitFailure {
            stdout: String::new(),
            stderr: String::new(),
            code: None,
            message: format!(
                "git {} timed out after {}s",
                args.join(" "),
                timeout.as_secs()
            ),
        }),
        Err(err) => Err(GitFailure {
            stdout: String::new(),
            stderr: String::new(),
            code: None,
            message: err.to_string(),
        }),
    }
}

/// Format a failure the way the UI expects to display it.
fn user_git_error(message: &str, args: &[&str], cwd: &Path, failure: &GitFailure) -> String {
    let code = failure
        .code
        .map(|c| format!("\nExit code: {c}"))
        .unwrap_or_default();
    format!(
        "{message}\nRepository: {}\nCommand: git {}{code}\n{}",
        basename(cwd),
        args.join(" "),
        failure.text()
    )
}

fn git_for_user(
    cwd: &Path,
    args: &[&str],
    timeout: Duration,
    message: &str,
) -> Result<Output, String> {
    git(cwd, args, timeout).map_err(|failure| user_git_error(message, args, cwd, &failure))
}

fn plain_git(cwd: &Path, args: &[&str], timeout: Duration) -> Result<Output, String> {
    git(cwd, args, timeout).map_err(|failure| failure.text())
}

fn has_upstream(cwd: &Path) -> bool {
    git(
        cwd,
        &["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"],
        DEFAULT_TIMEOUT,
    )
    .is_ok()
}

fn is_stale_push_failure(failure: &GitFailure) -> bool {
    let raw = failure.lower();
    raw.contains("[rejected]")
        || raw.contains("non-fast-forward")
        || raw.contains("fetch first")
        || raw.contains("stale info")
}

fn apply_patch(cwd: &Path, args: &[&str], patch: &str) -> Result<(), String> {
    let mut full: Vec<&str> = args.to_vec();
    full.push("-");
    run_git_with_input(cwd, &full, patch)
        .map(|_| ())
        .map_err(|err| err.to_string())
}

/// Make the index match exactly the user's selection: reset whatever was
/// staged before (from a terminal or an earlier failed attempt), then
/// `git apply --cached` the partially selected hunks and `git add` the fully
/// selected files.
#[tauri::command]
pub async fn stage_selection(
    repo_path: String,
    patch: Option<String>,
    file_paths: Vec<String>,
) -> Result<(), String> {
    blocking(move || {
        let cwd = PathBuf::from(&repo_path);
        if let Err(failure) = git(&cwd, &["reset", "-q", "HEAD"], DEFAULT_TIMEOUT) {
            log::warn!(
                "git reset HEAD failed for {repo_path} (may be initial commit): {}",
                failure.text()
            );
        }
        if let Some(patch) = patch.filter(|p| !p.trim().is_empty()) {
            apply_patch(
                &cwd,
                &["apply", "--cached", "--unidiff-zero", "--whitespace=nowarn"],
                &patch,
            )?;
        }
        if !file_paths.is_empty() {
            let mut args: Vec<&str> = vec!["add", "--"];
            args.extend(file_paths.iter().map(String::as_str));
            plain_git(&cwd, &args, DEFAULT_TIMEOUT)?;
        }
        Ok(())
    })
    .await?
}

#[tauri::command]
pub async fn commit(repo_path: String, message: String) -> Result<(), String> {
    blocking(move || {
        let cwd = PathBuf::from(&repo_path);
        plain_git(&cwd, &["commit", "-m", &message], COMMIT_TIMEOUT).map(|_| ())
    })
    .await?
}

fn push_repo(cwd: &Path) -> Result<(), String> {
    let status = get_repo_status(cwd);
    if matches!(status, RepoStatus::Missing | RepoStatus::NoGit) {
        return Ok(());
    }
    if let Err(failure) = git(cwd, &["fetch", "--prune"], PUSH_TIMEOUT) {
        log::warn!(
            "git fetch --prune failed for {}: {}",
            cwd.display(),
            failure.text()
        );
    }

    let status = get_repo_status(cwd);
    let upstream = has_upstream(cwd);
    if status != RepoStatus::Dirty && upstream {
        git_for_user(
            cwd,
            &["pull", "--ff-only"],
            PUSH_TIMEOUT,
            "Could not fast-forward before pushing.",
        )?;
    }

    let push_args = ["push"];
    let failure = match git(cwd, &push_args, PUSH_TIMEOUT) {
        Ok(_) => return Ok(()),
        Err(failure) => failure,
    };

    if is_stale_push_failure(&failure) && upstream {
        log::warn!(
            "git push failed for {}; refreshing refs and retrying once: {}",
            cwd.display(),
            failure.text()
        );
        git_for_user(
            cwd,
            &["fetch", "--prune"],
            PUSH_TIMEOUT,
            "Push failed and refreshing refs also failed.",
        )?;
        git_for_user(
            cwd,
            &["pull", "--ff-only"],
            PUSH_TIMEOUT,
            "Push was rejected and the branch could not be fast-forwarded before retrying.",
        )?;
        git_for_user(
            cwd,
            &push_args,
            PUSH_TIMEOUT,
            "Push failed after refreshing refs and retrying.",
        )?;
        return Ok(());
    }

    Err(user_git_error("Push failed.", &push_args, cwd, &failure))
}

/// Fetch, fast-forward when clean, push, and retry once after a stale
/// rejection.
#[tauri::command]
pub async fn push(repo_path: String) -> Result<(), String> {
    blocking(move || push_repo(&PathBuf::from(repo_path))).await?
}

/// Create a private GitHub repo with `gh` when there is no origin, then push
/// the current branch with an upstream.
#[tauri::command]
pub async fn create_private_repo_and_push(repo_path: String) -> Result<(), String> {
    blocking(move || {
        let cwd = PathBuf::from(&repo_path);
        if matches!(get_repo_status(&cwd), RepoStatus::Missing | RepoStatus::NoGit) {
            return Err("Repository path is missing or not a git repo.".to_string());
        }
        let has_origin = git(&cwd, &["remote", "get-url", "origin"], DEFAULT_TIMEOUT).is_ok();
        if !has_origin {
            let name = basename(&cwd);
            let output = Command::new("gh")
                .args(["repo", "create", &name, "--private", "--source", ".", "--remote", "origin"])
                .current_dir(&cwd)
                .stdin(Stdio::null())
                .output();
            let details = match output {
                Ok(output) if output.status.success() => None,
                Ok(output) => {
                    let stderr = stderr_string(&output).trim().to_string();
                    Some(if stderr.is_empty() {
                        "Unknown error creating GitHub repository.".to_string()
                    } else {
                        stderr
                    })
                }
                Err(err) => Some(err.to_string()),
            };
            if let Some(details) = details {
                return Err(format!(
                    "Failed to create private GitHub repo. Ensure gh CLI is installed and authenticated. {details}"
                ));
            }
        }
        plain_git(&cwd, &["push", "-u", "origin", "HEAD"], PUSH_TIMEOUT).map(|_| ())
    })
    .await?
}

/// Discard a whole file, including anything staged for it: a new file is
/// dropped from the index and deleted, a tracked file is restored from HEAD
/// in both the index and the working tree.
#[tauri::command]
pub async fn discard_file(
    repo_path: String,
    file_path: String,
    is_new: bool,
) -> Result<(), String> {
    blocking(move || {
        let cwd = PathBuf::from(&repo_path);
        if is_new {
            plain_git(
                &cwd,
                &["rm", "-q", "--cached", "--ignore-unmatch", "--", &file_path],
                DEFAULT_TIMEOUT,
            )?;
            std::fs::remove_file(cwd.join(&file_path)).map_err(|e| format!("{file_path}: {e}"))
        } else {
            plain_git(
                &cwd,
                &["checkout", "HEAD", "--", &file_path],
                DEFAULT_TIMEOUT,
            )
            .map(|_| ())
        }
    })
    .await?
}

/// Apply a forward "undo" patch to the working tree.
#[tauri::command]
pub async fn discard_lines(repo_path: String, patch: String) -> Result<(), String> {
    blocking(move || {
        apply_patch(
            &PathBuf::from(repo_path),
            &["apply", "--unidiff-zero", "--whitespace=nowarn"],
            &patch,
        )
    })
    .await?
}

/// Web URL for a GitHub remote (ssh, ssh://, http or https), else `None`.
pub fn github_web_url(remote_url: &str) -> Option<String> {
    let trimmed = remote_url.trim();
    if trimmed.is_empty() {
        return None;
    }
    let strip_git = |slug: &str| slug.strip_suffix(".git").unwrap_or(slug).to_string();
    if let Some(slug) = trimmed.strip_prefix("git@github.com:") {
        let slug = strip_git(slug);
        return (!slug.is_empty()).then(|| format!("https://github.com/{slug}"));
    }
    if let Some(slug) = trimmed.strip_prefix("ssh://git@github.com/") {
        let slug = strip_git(slug);
        return (!slug.is_empty()).then(|| format!("https://github.com/{slug}"));
    }
    if trimmed.starts_with("https://github.com/") || trimmed.starts_with("http://github.com/") {
        let https = trimmed.replacen("http://", "https://", 1);
        return Some(strip_git(&https));
    }
    None
}

#[tauri::command]
pub async fn open_in_github_web(app: AppHandle, repo_path: String) -> Result<(), String> {
    let url = blocking(move || {
        let cwd = PathBuf::from(&repo_path);
        let output = plain_git(
            &cwd,
            &["remote", "get-url", "origin"],
            Duration::from_secs(10),
        )?;
        github_web_url(&stdout_string(&output))
            .ok_or_else(|| "Repository origin is not a GitHub URL.".to_string())
    })
    .await??;
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn reveal_in_finder(app: AppHandle, file_path: String) -> Result<(), String> {
    app.opener()
        .reveal_item_in_dir(file_path)
        .map_err(|e| e.to_string())
}

fn spawn_detached(program: &str, args: &[&str]) -> Result<(), String> {
    Command::new(program)
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("Could not launch {program}: {e}"))
}

#[tauri::command]
pub fn open_in_cursor(repo_path: String, file_path: String) -> Result<(), String> {
    spawn_detached("cursor", &[&repo_path, &file_path])
}

#[tauri::command]
pub fn open_in_github_desktop(repo_path: String) -> Result<(), String> {
    spawn_detached("github", &[&repo_path])
}

#[cfg(test)]
mod tests {
    use super::github_web_url;

    #[test]
    fn converts_github_remotes_to_web_urls() {
        assert_eq!(
            github_web_url("git@github.com:owner/repo.git").as_deref(),
            Some("https://github.com/owner/repo")
        );
        assert_eq!(
            github_web_url("ssh://git@github.com/owner/repo").as_deref(),
            Some("https://github.com/owner/repo")
        );
        assert_eq!(
            github_web_url("http://github.com/owner/repo.git\n").as_deref(),
            Some("https://github.com/owner/repo")
        );
        assert_eq!(github_web_url("https://gitlab.com/owner/repo"), None);
        assert_eq!(github_web_url("git@github.com:"), None);
    }
}
