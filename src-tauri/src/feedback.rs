//! 设置 → 关于与反馈 (v0.4.6): opens one of a few fixed project pages in the
//! default browser. GST itself never connects; the browser does.

/// Error code when the browser cannot be started.
pub const FEEDBACK_OPEN_FAILED: &str = "feedback_open_failed";
/// Error code for a page name outside the fixed list.
pub const FEEDBACK_UNKNOWN_LINK: &str = "feedback_unknown_link";

const REPOSITORY: &str = "https://github.com/Awes0meE/Global-Software-Timer";

/// The page for `link`: `bug` (the problem form), `idea` (the suggestion
/// form) or `releases`. Anything else has no page, so the frontend can never
/// make GST open an arbitrary address.
pub fn feedback_url(link: &str) -> Option<String> {
    let path = match link {
        "bug" => "/issues/new?template=bug_report.yml",
        "idea" => "/issues/new?template=feature_request.yml",
        "releases" => "/releases",
        _ => return None,
    };
    Some(format!("{REPOSITORY}{path}"))
}

#[tauri::command]
pub fn open_feedback_link(link: String) -> Result<(), String> {
    let url = feedback_url(&link).ok_or_else(|| FEEDBACK_UNKNOWN_LINK.to_string())?;
    // Explorer hands an https address to the default browser.
    let mut command = std::process::Command::new(crate::export::explorer_path());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.raw_arg(format!("\"{url}\""));
    }
    #[cfg(not(windows))]
    command.arg(&url);
    // explorer.exe exits with 1 even on success, so its status is not checked.
    command
        .spawn()
        .map_err(|_| FEEDBACK_OPEN_FAILED.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::feedback_url;

    #[test]
    fn opens_only_the_fixed_project_pages() {
        assert_eq!(
            feedback_url("bug").as_deref(),
            Some("https://github.com/Awes0meE/Global-Software-Timer/issues/new?template=bug_report.yml")
        );
        assert_eq!(
            feedback_url("idea").as_deref(),
            Some("https://github.com/Awes0meE/Global-Software-Timer/issues/new?template=feature_request.yml")
        );
        assert_eq!(
            feedback_url("releases").as_deref(),
            Some("https://github.com/Awes0meE/Global-Software-Timer/releases")
        );
        for other in ["", "BUG", "https://example.com", "../releases", "qq"] {
            assert_eq!(feedback_url(other), None, "{other}");
        }
    }

    #[test]
    fn every_page_is_https_on_the_project_repository() {
        for link in ["bug", "idea", "releases"] {
            let url = feedback_url(link).expect(link);
            assert!(
                url.starts_with("https://github.com/Awes0meE/Global-Software-Timer/"),
                "{url}"
            );
            assert!(!url.contains('"') && !url.contains(' '), "{url}");
        }
    }
}
