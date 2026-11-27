use semver::Version;

pub fn parse(text: &str) -> Option<Version> {
    let text = text.trim();
    let start = text.find(|c: char| c.is_ascii_digit())?;
    let text = &text[start..];
    let (number, rest) = match text.find(['-', '+']) {
        Some(index) => (&text[..index], &text[index..]),
        None => (text, ""),
    };
    let padded = match number.matches('.').count() {
        0 => format!("{number}.0.0{rest}"),
        1 => format!("{number}.0{rest}"),
        _ => text.to_string(),
    };
    Version::parse(&padded).ok()
}

pub fn is_newer(latest: &str, installed: &str) -> bool {
    match (parse(latest), parse(installed)) {
        (Some(latest), Some(installed)) => latest > installed,
        _ => latest != installed,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tags_with_a_prefix_or_two_parts_are_read() {
        assert_eq!(parse("v1.2").unwrap().to_string(), "1.2.0");
        assert_eq!(parse("photocraft-v0.5.0").unwrap().to_string(), "0.5.0");
        assert_eq!(parse("0.2.0-rc.1").unwrap().to_string(), "0.2.0-rc.1");
        assert!(parse("nightly").is_none());
    }

    #[test]
    fn a_larger_number_is_newer_not_a_longer_text() {
        assert!(is_newer("0.10.0", "0.9.0"));
        assert!(!is_newer("0.9.0", "0.10.0"));
        assert!(!is_newer("v1.0.0", "1.0.0"));
    }
}
