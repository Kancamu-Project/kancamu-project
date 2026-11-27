import { i18n, popups, account } from "../assets/js/shared.js";
import appData from "./data.js";

await i18n.load(appData);

const $ = (id) => document.getElementById(id);
const query = new URLSearchParams(location.search);
const home = new URL("./", location.href).href;

const safe = (address) => {
    try {
        return new URL(address, location.href).origin === location.origin ? address : home;
    } catch {
        return home;
    }
};

function fail(code) {
    $("callback-working").hidden = true;
    popups.toast(i18n.t(`error.${code}`), { kind: "error" });
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
