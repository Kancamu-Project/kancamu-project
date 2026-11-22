// Deletes what an older version of the code left in this browser and that the code of today does not use any more.
// The webs of Kancamu, muOS, and the apps of ArtCraft all run on one origin and share its localStorage, its databases, and its caches, so this file never deletes
// "what it does not know": it deletes the names that are listed here, and only those. A name is added to a list when the code stops using it:
//   - the key of localStorage that is not read or written by any web any more        (LOCAL_KEYS)
//   - the database of IndexedDB or the cache of Cache Storage that no web opens now  (DATABASES, CACHES)
// What the code of today uses is not here: theme, lang, account, <app>.settings, lingomu.progress, mujs.progress, drivemu.view, muai.autoload, muai.seen.<model>,
// the database "muai", and the cache "transformers-cache". (A token that is not of the sign-in with GitHub is deleted by assets/js/account.js.)
(() => {
    const LOCAL_KEYS = [
        "drivemu.accounts.v2",   // the accounts of Drivemu before the shared sign-in: it kept personal tokens
        "drivemu.session.v1",    // the session of Drivemu before the shared sign-in
        "muai.model",            // the chosen model of muAI, now in "muai.settings"
        "muai.sideWidth",        // the width of the sidebar of muAI, now in "muai.settings"
    ];
    const DATABASES = [];        // the names of IndexedDB databases
    const CACHES = [];           // the names of Cache Storage caches

    for (const key of LOCAL_KEYS) {
        try {
            if (localStorage.getItem(key) !== null) localStorage.removeItem(key);
        } catch {}
    }
    for (const name of DATABASES) {
        try {
            indexedDB.deleteDatabase(name);
        } catch {}
    }
    for (const name of CACHES) {
        try {
            caches.delete(name);
        } catch {}
    }
})();
