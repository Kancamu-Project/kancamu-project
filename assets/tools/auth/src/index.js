const TOKEN_URL = "https://github.com/login/oauth/access_token";

const json = (body, status = 200, extra = {}) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...extra },
    });

async function exchange({ code, redirect_uri: redirect, code_verifier: verifier }, origin, env, cors) {
    if (typeof code !== "string" || !code || typeof verifier !== "string" || !verifier || redirect !== origin + env.CALLBACK_PATH) {
        return json({ error: "request" }, 400, cors);
    }
    let data;
    try {
        const response = await fetch(TOKEN_URL, {
            method: "POST",
            headers: { Accept: "application/json", "Content-Type": "application/json", "User-Agent": "kancamu-auth" },
            body: JSON.stringify({
                client_id: env.GITHUB_CLIENT_ID,
                client_secret: env.GITHUB_CLIENT_SECRET,
                code,
                redirect_uri: redirect,
                code_verifier: verifier,
            }),
        });
        data = await response.json();
    } catch {
        return json({ error: "github" }, 502, cors);
    }
    if (!data.access_token) return json({ error: data.error || "failed" }, 400, cors);
    return json({ access_token: data.access_token, expires_in: data.expires_in ?? null, scope: data.scope ?? "" }, 200, cors);
}

async function revoke({ token }, env, cors) {
    if (typeof token !== "string" || !token) return json({ error: "request" }, 400, cors);
    try {
        const response = await fetch(`https://api.github.com/applications/${env.GITHUB_CLIENT_ID}/token`, {
            method: "DELETE",
            headers: {
                Authorization: `Basic ${btoa(`${env.GITHUB_CLIENT_ID}:${env.GITHUB_CLIENT_SECRET}`)}`,
                Accept: "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
                "Content-Type": "application/json",
                "User-Agent": "kancamu-auth",
            },
            body: JSON.stringify({ access_token: token }),
        });
        return json({ revoked: response.status === 204 }, 200, cors);
    } catch {
        return json({ error: "github" }, 502, cors);
    }
}

export default {
    async fetch(request, env) {
        const origin = request.headers.get("Origin") || "";
        const allowed = env.ALLOWED_ORIGINS.split(",").map((item) => item.trim());
        const cors = allowed.includes(origin) ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : null;

        if (request.method === "OPTIONS") {
            if (!cors) return new Response(null, { status: 403 });
            return new Response(null, {
                status: 204,
                headers: { ...cors, "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Max-Age": "86400" },
            });
        }
        if (!cors) return json({ error: "origin" }, 403);
        if (request.method !== "POST") return json({ error: "method" }, 405, cors);

        let body;
        try {
            body = await request.json();
        } catch {
            return json({ error: "request" }, 400, cors);
        }
        const { pathname } = new URL(request.url);
        if (pathname === "/token") return exchange(body, origin, env, cors);
        if (pathname === "/revoke") return revoke(body, env, cors);
        return json({ error: "not_found" }, 404, cors);
    },
};
