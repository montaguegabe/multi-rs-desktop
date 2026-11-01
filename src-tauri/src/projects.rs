//! Read-only project inspection commands over `multi_core::app_api`: the
//! project list with nested worktrees, fresh statuses, project detail and
//! history group diffs.

use std::collections::{BTreeMap, BTreeSet, HashMap};
use std::path::{Path, PathBuf};

use multi_core::app_api::{
    self, HistoryCommitRef, HistoryRepoDiff, ProjectDetail, ProjectSummary, RepoBranchPayload,
};
use multi_core::fsx;
use multi_core::worktree::list_linked_worktree_paths;
use multi_core::{Paths, load_repos};
use serde::Serialize;

use crate::store::read_project_paths;
use crate::tasks::blocking;

fn basename(path: &str) -> String {
    Path::new(path)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| path.to_string())
}

/// Hide sub-repos pinned to a `fixedBranch` from a project's branch summary:
/// they are expected to differ from the workspace branch.
fn filter_pinned_repo_branches(
    project_path: &Path,
    branches: Vec<RepoBranchPayload>,
) -> Vec<RepoBranchPayload> {
    if !project_path.join("multi.json").exists() {
        return branches;
    }
    let Ok(repos) = load_repos(&Paths::at_root(project_path, None)) else {
        return branches;
    };
    let pinned: BTreeSet<PathBuf> = repos
        .into_iter()
        .filter(|repo| repo.fixed_branch.is_some())
        .map(|repo| fsx::resolve(&repo.path))
        .collect();
    if pinned.is_empty() {
        return branches;
    }
    branches
        .into_iter()
        .filter(|branch| !pinned.contains(&fsx::resolve(Path::new(&branch.path))))
        .collect()
}

fn filter_summary_branches(mut summary: ProjectSummary) -> ProjectSummary {
    let path = PathBuf::from(&summary.path);
    summary.branches = filter_pinned_repo_branches(&path, std::mem::take(&mut summary.branches));
    summary
}

/// Nest per-path summaries into trunk projects with their linked worktrees
/// attached. Configured paths that are worktrees of another configured
/// project only appear nested; configured paths with no summary are dropped.
fn build_project_summary_tree(
    configured: &[String],
    worktrees_by_project: &BTreeMap<String, Vec<String>>,
    mut summaries: HashMap<String, ProjectSummary>,
) -> Vec<ProjectSummary> {
    let nested: BTreeSet<&String> = configured
        .iter()
        .flat_map(|project| {
            worktrees_by_project
                .get(project)
                .into_iter()
                .flatten()
                .filter(move |worktree| *worktree != project)
        })
        .collect();

    let mut tree = Vec::new();
    for project in configured {
        if nested.contains(project) {
            continue;
        }
        let Some(mut summary) = summaries.remove(project) else {
            continue;
        };
        let mut worktrees: Vec<ProjectSummary> = worktrees_by_project
            .get(project)
            .into_iter()
            .flatten()
            .filter_map(|worktree| summaries.get(worktree).cloned())
            .collect();
        worktrees.sort_by_key(|w| basename(&w.path));
        summary.worktrees = if worktrees.is_empty() {
            None
        } else {
            Some(worktrees)
        };
        tree.push(summary);
    }
    tree
}

/// Configured projects (cached metadata where fresh) with linked worktrees
/// nested under their trunk checkout.
#[tauri::command]
pub async fn get_projects_summary() -> Result<Vec<ProjectSummary>, String> {
    blocking(|| {
        let configured = read_project_paths();
        let worktrees_by_project: BTreeMap<String, Vec<String>> = configured
            .iter()
            .map(|project| {
                (
                    project.clone(),
                    list_linked_worktree_paths(Path::new(project)),
                )
            })
            .collect();
        let mut all_paths: Vec<String> = configured.clone();
        for worktrees in worktrees_by_project.values() {
            for worktree in worktrees {
                if !all_paths.contains(worktree) {
                    all_paths.push(worktree.clone());
                }
            }
        }
        let summaries: HashMap<String, ProjectSummary> = app_api::get_projects_summary(&all_paths)
            .into_iter()
            .map(filter_summary_branches)
            .map(|summary| (summary.path.clone(), summary))
            .collect();
        build_project_summary_tree(&configured, &worktrees_by_project, summaries)
    })
    .await
}

/// Freshly computed summaries (flat; the UI merges them by path).
#[tauri::command]
pub async fn get_project_statuses(repo_paths: Vec<String>) -> Result<Vec<ProjectSummary>, String> {
    blocking(move || {
        app_api::refresh_projects_summary(&repo_paths)
            .into_iter()
            .map(filter_summary_branches)
            .collect()
    })
    .await
}

/// Diffs, combined history and sync state for one project.
#[tauri::command]
pub async fn get_project_detail(repo_path: String) -> Result<ProjectDetail, String> {
    if repo_path.is_empty() {
        return Err("repoPath must be a non-empty string.".into());
    }
    blocking(move || {
        let path = PathBuf::from(&repo_path);
        let mut detail = app_api::get_project_detail(&path);
        detail.branches = filter_pinned_repo_branches(&path, std::mem::take(&mut detail.branches));
        detail
    })
    .await
}

/// Per-repo diffs for the commits of one history group.
#[tauri::command]
pub async fn get_history_group_diff(
    commits: Vec<HistoryCommitRef>,
) -> Result<Vec<HistoryRepoDiff>, String> {
    blocking(move || app_api::get_history_group_diff(&commits)).await
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NavigationTarget {
    pub repo_path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file_path: Option<String>,
}

/// Resolve a filesystem path (from `multi://open?path=...` or a drop) to the
/// repository containing it. Files resolve to their git top level.
pub fn resolve_navigation_target(input: &Path) -> Option<NavigationTarget> {
    app_api::resolve_navigation_path(input).map(|(repo_path, file_path)| NavigationTarget {
        repo_path: repo_path.display().to_string(),
        file_path,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use multi_core::app_api::RepoStatus;

    fn summary(path: &str) -> ProjectSummary {
        ProjectSummary {
            path: path.into(),
            name: basename(path),
            last_modified_ms: None,
            last_commit_ms: None,
            status: RepoStatus::Unknown,
            doctor_result: None,
            sub_repos: None,
            branches: Vec::new(),
            worktrees: None,
        }
    }

    #[test]
    fn nests_worktrees_under_trunk_and_hides_them_at_top_level() {
        let configured = vec!["/p/trunk".to_string(), "/p/trunk-worktrees/b".to_string()];
        let mut by_project = BTreeMap::new();
        by_project.insert(
            "/p/trunk".to_string(),
            vec![
                "/p/trunk-worktrees/b".to_string(),
                "/p/trunk-worktrees/a".to_string(),
            ],
        );
        by_project.insert("/p/trunk-worktrees/b".to_string(), vec![]);
        let summaries: HashMap<String, ProjectSummary> =
            ["/p/trunk", "/p/trunk-worktrees/a", "/p/trunk-worktrees/b"]
                .into_iter()
                .map(|p| (p.to_string(), summary(p)))
                .collect();
        let tree = build_project_summary_tree(&configured, &by_project, summaries);
        assert_eq!(tree.len(), 1);
        let worktrees = tree[0].worktrees.as_ref().unwrap();
        assert_eq!(worktrees[0].path, "/p/trunk-worktrees/a");
        assert_eq!(worktrees[1].path, "/p/trunk-worktrees/b");
    }

    #[test]
    fn drops_projects_without_summaries_and_omits_empty_worktrees() {
        let configured = vec!["/p/one".to_string(), "/p/missing".to_string()];
        let mut by_project = BTreeMap::new();
        by_project.insert("/p/one".to_string(), vec![]);
        let summaries: HashMap<String, ProjectSummary> =
            [("/p/one".to_string(), summary("/p/one"))]
                .into_iter()
                .collect();
        let tree = build_project_summary_tree(&configured, &by_project, summaries);
        assert_eq!(tree.len(), 1);
        assert!(tree[0].worktrees.is_none());
    }
}
