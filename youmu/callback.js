// Where GitHub sends the user back after "Sign in with GitHub": the address has the code (?code=...&state=...) or an error (?error=access_denied).
// account.finishSignIn() (assets/js/account.js) checks the state, trades the code for a token, and saves the account; then the page the user came from opens again.
await i18n.load();

const $ = (id) => document.getElementById(id);
const query = new URLSearchParams(location.search);
const home = new URL("./", location.href).href;

// Only an address of this site is gone back to (the address was kept by this tab, but nothing is trusted)
const safe = (address) => {
    try {
        return new URL(address, location.href).origin === location.origin ? address : home;
    } catch {
        return home;
    }
};

function fail(code) {
    $("callback-working").hidden = true;
    $("callback-error").heading = i18n.t(`error.${code}`);
    $("callback-error").hidden = false;
    $("callback-back").href = home;
    $("callback-back").hidden = false;
}

try {
    if (query.get("error")) throw Object.assign(new Error(query.get("error")), { code: query.get("error") === "access_denied" ? "denied" : "failed" });
    const returnTo = await account.finishSignIn({ code: query.get("code"), state: query.get("state") });
    location.replace(safe(returnTo || home));
} catch (failure) {
    fail(failure.code || "failed");
}
