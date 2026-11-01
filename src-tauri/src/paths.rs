//! Small path helpers shared by the host-side modules.

use std::path::Path;

/// Final path component as text, or the whole path when it has none.
pub fn basename(path: &Path) -> String {
    path.file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| path.display().to_string())
}

#[cfg(test)]
mod tests {
    use super::basename;
    use std::path::Path;

    #[test]
    fn returns_last_component_or_whole_path() {
        assert_eq!(basename(Path::new("/a/b/repo")), "repo");
        assert_eq!(basename(Path::new("/a/b/repo/")), "repo");
        assert_eq!(basename(Path::new("/")), "/");
    }
}
