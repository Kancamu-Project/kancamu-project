use std::io::Read;
use std::time::Duration;

use serde::Deserialize;

use crate::version;

const SUMS_NAME: &str = "SHA256SUMS.txt";
const MAX_SUMS: u64 = 1024 * 1024;
const USER_AGENT: &str = concat!("desktop/", env!("CARGO_PKG_VERSION"));

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Asset {
    pub name: String,
    pub size: u64,
    pub url: String,
    pub sha256: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Release {
    pub tag: String,
    pub name: String,
    pub published: String,
    pub assets: Vec<Asset>,
}

impl Release {
    pub fn version(&self) -> String {
        version::parse(&self.tag).map_or_else(|| self.tag.clone(), |parsed| parsed.to_string())
    }
}

#[derive(Deserialize)]
struct ApiRelease {
    tag_name: String,
    name: Option<String>,
    published_at: Option<String>,
    draft: bool,
    prerelease: bool,
    assets: Vec<ApiAsset>,
}

#[derive(Deserialize)]
struct ApiAsset {
    name: String,
    size: u64,
    browser_download_url: String,
    digest: Option<String>,
}

pub fn agent() -> ureq::Agent {
    ureq::AgentBuilder::new().timeout_connect(Duration::from_secs(15)).timeout_read(Duration::from_secs(30)).user_agent(USER_AGENT).build()
}

pub fn fetch_latest(agent: &ureq::Agent, repo: &str) -> Result<Release, String> {
    let url = format!("https://api.github.com/repos/{repo}/releases?per_page=15");
    let response = match agent.get(&url).set("Accept", "application/vnd.github+json").call() {
        Ok(response) => response,
        Err(ureq::Error::Status(403 | 429, _)) => return Err("GitHub is limiting requests, try again later".to_string()),
        Err(ureq::Error::Status(404, _)) => return Err("No release published".to_string()),
        Err(error) => return Err(error.to_string()),
    };
    let releases: Vec<ApiRelease> = response.into_json().map_err(|error| error.to_string())?;
    let mut release = newest(repo, releases).ok_or_else(|| "No release published".to_string())?;
    fill_sums(agent, repo, &mut release);
    Ok(release)
}

fn newest(repo: &str, releases: Vec<ApiRelease>) -> Option<Release> {
    releases
        .into_iter()
        .filter(|item| !item.draft && !item.prerelease)
        .map(|item| to_release(repo, item))
        .filter(|item| !item.assets.is_empty())
        .max_by_key(|item| version::parse(&item.tag))
}

fn to_release(repo: &str, item: ApiRelease) -> Release {
    let tag = item.tag_name;
    let assets = item
        .assets
        .into_iter()
        .filter(|asset| download_url_ok(repo, &asset.browser_download_url))
        .map(|asset| Asset {
            sha256: asset.digest.as_deref().and_then(digest_hash),
            name: asset.name,
            size: asset.size,
            url: asset.browser_download_url,
        })
        .collect();
    Release { name: item.name.filter(|name| !name.is_empty()).unwrap_or_else(|| tag.clone()), published: item.published_at.unwrap_or_default().chars().take(10).collect(), tag, assets }
}

fn fill_sums(agent: &ureq::Agent, repo: &str, release: &mut Release) {
    if release.assets.iter().all(|asset| asset.sha256.is_some()) {
        return;
    }
    let Some(url) = release.assets.iter().find(|asset| asset.name == SUMS_NAME).map(|asset| asset.url.clone()) else {
        return;
    };
    if !download_url_ok(repo, &url) {
        return;
    }
    let mut text = String::new();
    let read = agent.get(&url).call().ok().and_then(|response| response.into_reader().take(MAX_SUMS).read_to_string(&mut text).ok());
    if read.is_none() {
        return;
    }
    let sums = parse_sums(&text);
    for asset in &mut release.assets {
        if asset.sha256.is_none() {
            asset.sha256 = sums.iter().find(|(_, name)| *name == asset.name).map(|(hash, _)| hash.clone());
        }
    }
}

fn digest_hash(digest: &str) -> Option<String> {
    digest.strip_prefix("sha256:").map(str::to_ascii_lowercase).filter(|hash| is_hex64(hash))
}

fn is_hex64(text: &str) -> bool {
    text.len() == 64 && text.bytes().all(|byte| byte.is_ascii_hexdigit())
}

pub fn parse_sums(text: &str) -> Vec<(String, String)> {
    text.lines()
        .filter_map(|line| {
            let (hash, name) = line.split_once(char::is_whitespace)?;
            let name = name.trim().trim_start_matches('*');
            (is_hex64(hash) && !name.is_empty()).then(|| (hash.to_ascii_lowercase(), name.to_string()))
        })
        .collect()
}

pub fn download_url_ok(repo: &str, url: &str) -> bool {
    let prefix = format!("https://github.com/{repo}/releases/download/");
    let Some(rest) = url.strip_prefix(&prefix) else {
        return false;
    };
    let mut parts = rest.split('/');
    match (parts.next(), parts.next(), parts.next()) {
        (Some(tag), Some(name), None) => segment_ok(tag) && segment_ok(name),
        _ => false,
    }
}

fn segment_ok(segment: &str) -> bool {
    let lower = segment.to_ascii_lowercase();
    !segment.is_empty()
        && segment != "."
        && segment != ".."
        && !segment.contains(['\\', '?', '#'])
        && !lower.contains("%2f")
        && !lower.contains("%5c")
        && !segment.chars().any(|c| c.is_control() || c.is_whitespace())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_download_must_belong_to_the_repository() {
        let repo = "storytold/photocraft";
        let good = "https://github.com/storytold/photocraft/releases/download/v1.0.0/photocraft-1.0.0-windows-x64.msi";
        assert!(download_url_ok(repo, good));
        assert!(!download_url_ok(repo, "https://github.com/storytold/photocraft/releases/download/../../../evil/x/releases/download/v1/a"));
        assert!(!download_url_ok(repo, "https://github.com/storytold/photocraft/releases/download/v1/a/b"));
        assert!(!download_url_ok(repo, "https://github.com/storytold/photocraft/releases/download/v1/a%2Fb"));
        assert!(!download_url_ok(repo, "https://example.com/storytold/photocraft/releases/download/v1/a"));
    }

    #[test]
    fn checksums_are_read_from_both_formats() {
        let hash = "a".repeat(64);
        let text = format!("{hash}  one.msi\n{}  *two.zip\nnot a checksum  three\n", "B".repeat(64));
        let sums = parse_sums(&text);
        assert_eq!(sums.len(), 2);
        assert_eq!(sums[0], (hash, "one.msi".to_string()));
        assert_eq!(sums[1].0, "b".repeat(64));
        assert_eq!(sums[1].1, "two.zip");
    }

    #[test]
    fn a_digest_without_sha256_is_ignored() {
        assert_eq!(digest_hash(&format!("sha256:{}", "c".repeat(64))), Some("c".repeat(64)));
        assert_eq!(digest_hash("md5:abc"), None);
        assert_eq!(digest_hash("sha256:short"), None);
    }
}
