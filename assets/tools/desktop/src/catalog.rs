pub struct App {
    pub id: &'static str,
    pub name: &'static str,
    pub repo: &'static str,
}

const fn app(id: &'static str, name: &'static str, repo: &'static str) -> App {
    App { id, name, repo }
}

pub const APPS: &[App] = &[
    app("photocraft", "PhotoCraft", "storytold/photocraft"),
    app("vectorcraft", "VectorCraft", "storytold/vectorcraft"),
    app("filmcraft", "FilmCraft", "storytold/filmcraft"),
    app("lightcraft", "LightCraft", "storytold/lightcraft"),
    app("pdfcraft", "PdfCraft", "storytold/pdfcraft"),
    app("effectcraft", "EffectCraft", "storytold/effectcraft"),
    app("anicraft", "AniCraft", "storytold/anicraft"),
    app("designcraft", "DesignCraft", "storytold/designcraft"),
    app("figcraft", "FigCraft", "storytold/figcraft"),
    app("soundcraft", "SoundCraft", "storytold/soundcraft"),
    app("wordcraft", "WordCraft", "storytold/wordcraft"),
    app("deckcraft", "DeckCraft", "storytold/deckcraft"),
    app("cadcraft", "CADCraft", "storytold/cadcraft"),
    app("gridcraft", "GridCraft", "storytold/gridcraft"),
    app("texturecraft", "TextureCraft", "storytold/texturecraft"),
    app("materialcraft", "MaterialCraft", "storytold/materialcraft"),
    app("craft-anything", "Craft Anything", "storytold/craft-anything"),
];

pub fn find(id: &str) -> Option<&'static App> {
    APPS.iter().find(|item| item.id == id)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_id_the_web_sends_is_looked_up_never_used_as_an_address() {
        assert!(find("deckcraft").is_some());
        assert!(find("../evil/repo").is_none());
        assert!(find("storytold/deckcraft").is_none());
        for item in APPS {
            assert_eq!(item.repo, format!("storytold/{}", item.id));
        }
    }
}
