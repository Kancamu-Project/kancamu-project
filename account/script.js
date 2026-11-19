// The account web: signs in with a GitHub personal access token and shows who is signed in.
// Any web opens it with account.open() (assets/account.js), which embeds this page in a dialog.
const $ = (id) => document.getElementById(id);
const t = (key) => i18n.t(key);
const embedded = window.parent !== window;

// What GitHub tells about the account and the token, fetched once per token.
let details = null;
async function fetchDetails(token) {
    let response;
    try {
        response = await fetch("https://api.github.com/user", {
            headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
        });
    } catch {
        return null;
    }
    if (response.status === 401) {
        account.signOut();
        return null;
    }
    if (!response.ok) return null;
    const header = (name) => response.headers.get(name);
    return {
        token,
        user: await response.json(),
        scopes: (header("x-oauth-scopes") || "").split(",").map((scope) => scope.trim()).filter(Boolean),
        limit: header("x-ratelimit-limit"),
        remaining: header("x-ratelimit-remaining"),
        expires: header("github-authentication-token-expiration"),
    };
}

const element = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
};

function section(title, rows) {
    const box = element("div", "detail-section");
    const list = element("div", "detail-rows");
    for (const [key, value] of rows) {
        if (value === null || value === undefined || value === "") continue;
        const row = element("div", "detail-row");
        const cell = element("span", "value");
        if (value instanceof Node) cell.append(value);
        else cell.textContent = value;
        row.append(element("span", "detail-key", key), cell);
        list.append(row);
    }
    box.append(element("span", "detail-section-title", title), list);
    return box;
}

function renderDetails() {
    const box = $("account-details");
    if (!details) return box.replaceChildren();
    const { user } = details;
    const link = user.html_url ? Object.assign(element("a", "", user.html_url.replace("https://", "")), { href: user.html_url, target: "_blank", rel: "noopener" }) : null;
    const date = (value) => (value ? i18n.date(value, { year: "numeric", month: "long", day: "numeric" }) : "");
    const scopes = details.scopes.length ? element("span", "scope-chips") : null;
    details.scopes.forEach((scope) => scopes.append(element("span", "scope-chip", scope)));
    box.replaceChildren(
        section(t("profile"), [
            [t("githubProfile"), link],
            [t("email"), user.email],
            [t("company"), user.company],
            [t("location"), user.location],
            [t("website"), user.blog],
            [t("publicRepos"), user.public_repos],
            [t("privateRepos"), user.owned_private_repos],
            [t("followers"), user.followers],
            [t("plan"), user.plan && user.plan.name],
            [t("memberSince"), date(user.created_at)],
        ]),
        section(t("tokenTitle"), [
            [t("tokenType"), t(details.token.startsWith("ghp_") ? "tokenKind.classic" : "tokenKind.other")],
            [t("tokenValue"), `…${details.token.slice(-4)}`],
            [t("scopes"), scopes],
            [t("apiLeft"), details.remaining && i18n.t("apiLeftValue", { remaining: details.remaining, limit: details.limit })],
            [t("expires"), date(details.expires)],
        ])
    );
    $("account-profile").querySelector(".account-bio").textContent = user.bio || "";
}

function render() {
    const user = account.get();
    $("token-form").hidden = !!user;
    $("account-profile").hidden = !user;
    document.querySelector(".page-header .page-title").textContent = t(user ? "account" : "title");
    if (user) {
        $("account-profile").querySelector(".account-avatar").style.backgroundImage = `url("${user.avatar}")`;
        $("account-profile").querySelector(".account-name").textContent = user.name;
        $("account-profile").querySelector(".account-login").textContent = `@${user.login}`;
        if (details?.token === user.token) renderDetails();
        else {
            details = null;
            renderDetails();
            fetchDetails(user.token).then((found) => {
                if (!found || account.get()?.token !== user.token) return;
                details = found;
                renderDetails();
                reportSize();
            });
        }
    } else {
        details = null;
    }
    reportSize();
}

// The dialog around this page grows and shrinks with the content.
function reportSize() {
    if (embedded) window.parent.postMessage({ type: "account:size", height: Math.ceil($("page").getBoundingClientRect().height) }, location.origin);
}

$("token-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = $("token-form").querySelector("[type=submit]");
    $("token-error").textContent = "";
    submit.disabled = true;
    try {
        await account.signIn($("token-input").value);
        $("token-input").value = "";
    } catch (failure) {
        $("token-error").textContent = t(`error.${failure.code || "failed"}`);
    }
    submit.disabled = false;
    reportSize();
});

$("sign-out-button").addEventListener("click", () => account.signOut());

// Opens GitHub with the "repo" scope already selected.
$("create-token-button").addEventListener("click", () => window.open(`${i18n.data.token.createUrl}?scopes=${i18n.data.token.scopes}&description=${encodeURIComponent(i18n.brand.name)}`, "_blank", "noopener"));

$("close-button").hidden = !embedded;
$("close-button").addEventListener("click", () => window.parent.postMessage({ type: "account:close" }, location.origin));
document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && embedded) window.parent.postMessage({ type: "account:close" }, location.origin);
});

// The first control, so the keyboard works at once when the dialog opens.
const focusFirst = () => (account.get() ? $("sign-out-button") : $("token-input")).focus();
window.addEventListener("message", (event) => {
    if (event.origin === location.origin && event.data?.type === "account:focus") focusFirst();
});

await i18n.load();
account.onChange(render);
i18n.onChange(render);
render();
new ResizeObserver(reportSize).observe($("page"));
if (embedded) focusFirst();
