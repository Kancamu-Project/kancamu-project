use crate::github::Asset;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Arch {
    X64,
    X86,
    Arm64,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Kind {
    Portable,
    Msi,
}

impl Kind {
    pub fn label(self) -> &'static str {
        match self {
            Self::Portable => "portable",
            Self::Msi => "msi",
        }
    }

    pub fn from_label(label: &str) -> Option<Self> {
        match label {
            "portable" => Some(Self::Portable),
            "msi" => Some(Self::Msi),
            _ => None,
        }
    }
}

pub fn current_arch() -> Arch {
    if cfg!(target_arch = "aarch64") {
        Arch::Arm64
    } else if cfg!(target_arch = "x86") {
        Arch::X86
    } else {
        Arch::X64
    }
}

pub fn can_install() -> bool {
    cfg!(target_os = "windows")
}

fn arch_of(name: &str) -> Option<Arch> {
    let lower = name.to_ascii_lowercase();
    if lower.contains("x86_64") || lower.contains("x64") || lower.contains("amd64") {
        Some(Arch::X64)
    } else if lower.contains("arm64") || lower.contains("aarch64") {
        Some(Arch::Arm64)
    } else if lower.contains("x86") || lower.contains("i686") {
        Some(Arch::X86)
    } else {
        None
    }
}

fn compatible(arch: Arch) -> &'static [Arch] {
    match arch {
        Arch::X64 => &[Arch::X64, Arch::X86],
        Arch::X86 => &[Arch::X86],
        Arch::Arm64 => &[Arch::Arm64, Arch::X64, Arch::X86],
    }
}

fn belongs_to(name: &str, id: &str) -> bool {
    let plain = |text: &str| text.to_ascii_lowercase().replace(['-', '_', ' '], "");
    plain(name).starts_with(&plain(id))
}

fn kind_of(name: &str) -> Option<Kind> {
    let lower = name.to_ascii_lowercase();
    if lower.ends_with(".msi") {
        Some(Kind::Msi)
    } else if lower.ends_with(".zip") && lower.contains("portable") {
        Some(Kind::Portable)
    } else {
        None
    }
}

pub fn pick_windows<'a>(assets: &'a [Asset], id: &str, arch: Arch) -> Option<(&'a Asset, Kind)> {
    for wanted in compatible(arch) {
        for kind in [Kind::Portable, Kind::Msi] {
            let found = assets.iter().find(|asset| {
                belongs_to(&asset.name, id) && !asset.name.to_ascii_lowercase().contains("linux") && kind_of(&asset.name) == Some(kind) && arch_of(&asset.name) == Some(*wanted)
            });
            if let Some(asset) = found {
                return Some((asset, kind));
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    fn assets(names: &[&str]) -> Vec<Asset> {
        names.iter().map(|name| Asset { name: name.to_string(), size: 1, url: String::new(), sha256: None }).collect()
    }

    const NAMES: &[&str] = &[
        "photocraft-0.5.0-linux-x86_64.AppImage",
        "photocraft-0.5.0-macos-arm64.dmg",
        "photocraft-0.5.0-windows-x64.msi",
        "photocraft-0.5.0-windows-x64-portable.zip",
        "photocraft-0.5.0-windows-x86.msi",
        "SHA256SUMS.txt",
    ];

    #[test]
    fn portable_is_preferred_because_it_needs_no_administrator() {
        let list = assets(NAMES);
        let (asset, kind) = pick_windows(&list, "photocraft", Arch::X64).unwrap();
        assert_eq!((asset.name.as_str(), kind), ("photocraft-0.5.0-windows-x64-portable.zip", Kind::Portable));
    }

    #[test]
    fn an_msi_is_used_when_there_is_no_portable_build() {
        let list = assets(&NAMES[2..3]);
        assert_eq!(pick_windows(&list, "photocraft", Arch::X64).unwrap().1, Kind::Msi);
    }

    #[test]
    fn windows_on_arm_runs_the_x64_build_but_x64_never_takes_arm() {
        let list = assets(&["photocraft-0.5.0-windows-x64.msi"]);
        assert!(pick_windows(&list, "photocraft", Arch::Arm64).is_some());
        let arm_only = assets(&["photocraft-0.5.0-windows-arm64.msi"]);
        assert!(pick_windows(&arm_only, "photocraft", Arch::X64).is_none());
    }

    #[test]
    fn another_app_with_a_similar_name_is_not_taken() {
        let list = assets(&["photocraft-0.5.0-windows-x64.msi"]);
        assert!(pick_windows(&list, "pdfcraft", Arch::X64).is_none());
    }

    #[test]
    fn names_with_underscores_are_matched() {
        let list = assets(&["ArtCraft_0.41.1_x64_en-US.msi"]);
        assert!(pick_windows(&list, "artcraft", Arch::X64).is_some());
    }
}
