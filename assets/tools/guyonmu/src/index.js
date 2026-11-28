const encoder = new TextEncoder();
const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;
const BODY_LIMIT = 8192;

class Failure extends Error {
    constructor(status, code) {
        super(code);
        this.status = status;
        this.code = code;
    }
}

const json = (body, status = 200, extra = {}) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...extra },
    });

const number = (value) => Number(value);
const integer = (value) => {
    const result = Number(value);
    if (!Number.isInteger(result) || result < 1) throw new Failure(400, "request");
    return result;
};
const toBase64Url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromBase64Url = (text) => Uint8Array.from(atob(text.replace(/-/g, "+").replace(/_/g, "/")), (character) => character.charCodeAt(0));
const keyOf = (env) => crypto.subtle.importKey("raw", encoder.encode(env.SESSION_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);

async function sign(payload, env) {
    const data = toBase64Url(encoder.encode(JSON.stringify(payload)));
    const signature = await crypto.subtle.sign("HMAC", await keyOf(env), encoder.encode(data));
    return `${data}.${toBase64Url(signature)}`;
}

async function verify(session, env) {
    const [data, signature] = session.split(".");
    if (!data || !signature) return null;
    try {
        const valid = await crypto.subtle.verify("HMAC", await keyOf(env), fromBase64Url(signature), encoder.encode(data));
        if (!valid) return null;
        const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(data)));
        return payload.exp > Date.now() ? payload : null;
    } catch {
        return null;
    }
}

async function viewerOf(request, env) {
    const header = request.headers.get("Authorization") || "";
    if (!header) return null;
    const payload = header.startsWith("Bearer ") ? await verify(header.slice(7), env) : null;
    if (!payload) throw new Failure(401, "session");
    const row = await env.DB.prepare("SELECT id FROM users WHERE id = ?1").bind(payload.sub).first();
    if (!row) throw new Failure(401, "session");
    return row.id;
}

const requireViewer = (viewer) => {
    if (!viewer) throw new Failure(401, "session");
    return viewer;
};

async function readJson(request) {
    const text = await request.text();
    if (text.length > BODY_LIMIT) throw new Failure(413, "size");
    try {
        const body = JSON.parse(text || "{}");
        if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
        return body;
    } catch {
        throw new Failure(400, "request");
    }
}

const clean = (value, limit, { multiline = false } = {}) => {
    if (typeof value !== "string") throw new Failure(400, "request");
    const text = multiline
        ? value.replace(/\r\n?/g, "\n").replace(/[^\S\n]+/g, " ").replace(/ ?\n ?/g, "\n").replace(/\n{3,}/g, "\n\n").trim()
        : value.replace(/\s+/g, " ").trim();
    if ([...text].length > limit) throw new Failure(400, "length");
    return text;
};

const like = (text) => `%${text.replace(/[\\%_]/g, "\\$&")}%`;

const postColumns = `
    p.id, p.body, p.parent_id AS parentId, p.like_count AS likes, p.reply_count AS replies, p.created_at AS createdAt,
    u.id AS userId, u.login, u.name, u.avatar,
    EXISTS(SELECT 1 FROM likes WHERE post_id = p.id AND user_id = ?1) AS liked
    FROM posts p JOIN users u ON u.id = p.user_id`;

const publicPost = (row, viewer) => ({
    id: row.id,
    body: row.body,
    parentId: row.parentId,
    likes: row.likes,
    replies: row.replies,
    createdAt: row.createdAt,
    liked: !!row.liked,
    own: viewer !== null && row.userId === viewer,
    user: { login: row.login, name: row.name, avatar: row.avatar },
});

async function getPost(env, id, viewer) {
    const row = await env.DB.prepare(`SELECT ${postColumns} WHERE p.id = ?2`).bind(viewer ?? 0, id).first();
    if (!row) throw new Failure(404, "post");
    return publicPost(row, viewer);
}

async function findUser(env, login, viewer) {
    const row = await env.DB.prepare(
        `SELECT u.id, u.login, u.name, u.avatar, u.bio, u.created_at AS createdAt,
            (SELECT COUNT(*) FROM follows WHERE followee_id = u.id) AS followers,
            (SELECT COUNT(*) FROM follows WHERE follower_id = u.id) AS following,
            (SELECT COUNT(*) FROM posts WHERE user_id = u.id AND parent_id IS NULL) AS posts,
            EXISTS(SELECT 1 FROM follows WHERE follower_id = ?2 AND followee_id = u.id) AS followed
        FROM users u WHERE u.login = ?1`,
    ).bind(login, viewer ?? 0).first();
    if (!row) throw new Failure(404, "user");
    return { ...row, followed: !!row.followed, own: viewer !== null && row.id === viewer };
}

async function createSession({ token }, env) {
    if (typeof token !== "string" || !token) throw new Failure(400, "request");
    let response;
    try {
        response = await fetch(`${env.GITHUB_API}/user`, {
            headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "User-Agent": "kancamu-guyonmu" },
        });
    } catch {
        throw new Failure(502, "github");
    }
    if (response.status === 401 || response.status === 403) throw new Failure(401, "github");
    if (!response.ok) throw new Failure(502, "github");
    const profile = await response.json();
    if (!Number.isInteger(profile.id) || typeof profile.login !== "string") throw new Failure(502, "github");
    await env.DB.prepare(
        `INSERT INTO users (id, login, name, avatar, created_at) VALUES (?1, ?2, ?3, ?4, ?5)
        ON CONFLICT(id) DO UPDATE SET login = excluded.login, name = excluded.name, avatar = excluded.avatar`,
    ).bind(profile.id, profile.login, profile.name || profile.login, profile.avatar_url || "", Date.now()).run();
    const expires = Date.now() + number(env.SESSION_DAYS) * DAY;
    return {
        session: await sign({ sub: profile.id, exp: expires }, env),
        expires,
        user: await findUser(env, profile.login, profile.id),
    };
}

async function listPosts(url, env, viewer) {
    const size = number(env.PAGE_SIZE);
    const query = url.searchParams;
    const parent = query.get("parent");
    const cursor = query.get("cursor") ? integer(query.get("cursor")) : 0;
    const wheres = [];
    const values = [viewer ?? 0];
    const add = (clause, ...bound) => {
        let text = clause;
        for (const value of bound) {
            values.push(value);
            text = text.replace("?", `?${values.length}`);
        }
        wheres.push(text);
    };

    if (parent) add("p.parent_id = ?", integer(parent));
    else add("p.parent_id IS NULL");
    if (query.get("user")) add("u.login = ?", query.get("user"));
    if (query.get("feed") === "following") {
        requireViewer(viewer);
        add("(p.user_id = ?1 OR p.user_id IN (SELECT followee_id FROM follows WHERE follower_id = ?1))");
    }
    if (query.get("q")) add("p.body LIKE ? ESCAPE '\\'", like(clean(query.get("q"), number(env.POST_MAX))));
    if (cursor) add(parent ? "p.id > ?" : "p.id < ?", cursor);

    const order = parent ? "ASC" : "DESC";
    const { results } = await env.DB.prepare(`SELECT ${postColumns} WHERE ${wheres.join(" AND ")} ORDER BY p.id ${order} LIMIT ${size + 1}`).bind(...values).all();
    const more = results.length > size;
    const posts = results.slice(0, size).map((row) => publicPost(row, viewer));
    return { posts, next: more ? posts[posts.length - 1].id : null };
}

async function createPost(body, env, viewer) {
    requireViewer(viewer);
    const text = clean(body.body, number(env.POST_MAX), { multiline: true });
    if (!text) throw new Failure(400, "empty");
    const parent = body.parentId == null ? null : integer(body.parentId);
    if (parent !== null) {
        const found = await env.DB.prepare("SELECT id FROM posts WHERE id = ?1").bind(parent).first();
        if (!found) throw new Failure(404, "post");
    }
    const recent = await env.DB.prepare("SELECT COUNT(*) AS total FROM posts WHERE user_id = ?1 AND created_at > ?2").bind(viewer, Date.now() - MINUTE).first();
    if (recent.total >= number(env.POSTS_PER_MINUTE)) throw new Failure(429, "rate");
    const [inserted] = await env.DB.batch([
        env.DB.prepare("INSERT INTO posts (user_id, parent_id, body, created_at) VALUES (?1, ?2, ?3, ?4) RETURNING id").bind(viewer, parent, text, Date.now()),
        env.DB.prepare("UPDATE posts SET reply_count = (SELECT COUNT(*) FROM posts WHERE parent_id = ?1) WHERE id = ?1").bind(parent ?? 0),
    ]);
    return getPost(env, inserted.results[0].id, viewer);
}

async function removePost(id, env, viewer) {
    requireViewer(viewer);
    const row = await env.DB.prepare("SELECT user_id AS userId, parent_id AS parentId FROM posts WHERE id = ?1").bind(id).first();
    if (!row) throw new Failure(404, "post");
    if (row.userId !== viewer) throw new Failure(403, "owner");
    await env.DB.batch([
        env.DB.prepare("DELETE FROM posts WHERE id = ?1").bind(id),
        env.DB.prepare("UPDATE posts SET reply_count = (SELECT COUNT(*) FROM posts WHERE parent_id = ?1) WHERE id = ?1").bind(row.parentId ?? 0),
    ]);
    return { deleted: true };
}

async function setLike(id, on, env, viewer) {
    requireViewer(viewer);
    const found = await env.DB.prepare("SELECT id FROM posts WHERE id = ?1").bind(id).first();
    if (!found) throw new Failure(404, "post");
    await env.DB.batch([
        on
            ? env.DB.prepare("INSERT OR IGNORE INTO likes (user_id, post_id, created_at) VALUES (?1, ?2, ?3)").bind(viewer, id, Date.now())
            : env.DB.prepare("DELETE FROM likes WHERE user_id = ?1 AND post_id = ?2").bind(viewer, id),
        env.DB.prepare("UPDATE posts SET like_count = (SELECT COUNT(*) FROM likes WHERE post_id = ?1) WHERE id = ?1").bind(id),
    ]);
    return getPost(env, id, viewer);
}

async function setFollow(login, on, env, viewer) {
    requireViewer(viewer);
    const target = await findUser(env, login, viewer);
    if (target.id === viewer) throw new Failure(400, "self");
    await (on
        ? env.DB.prepare("INSERT OR IGNORE INTO follows (follower_id, followee_id, created_at) VALUES (?1, ?2, ?3)").bind(viewer, target.id, Date.now())
        : env.DB.prepare("DELETE FROM follows WHERE follower_id = ?1 AND followee_id = ?2").bind(viewer, target.id)
    ).run();
    return findUser(env, login, viewer);
}

async function searchUsers(url, env, viewer) {
    const text = clean(url.searchParams.get("q") || "", number(env.POST_MAX));
    if (!text) return { users: [] };
    const { results } = await env.DB.prepare(
        `SELECT login, name, avatar FROM users WHERE login LIKE ?1 ESCAPE '\\' OR name LIKE ?1 ESCAPE '\\' ORDER BY login LIMIT 5`,
    ).bind(like(text)).all();
    return { users: results };
}

async function updateProfile(body, env, viewer) {
    requireViewer(viewer);
    const bio = clean(body.bio, number(env.BIO_MAX), { multiline: true });
    await env.DB.prepare("UPDATE users SET bio = ?2 WHERE id = ?1").bind(viewer, bio).run();
    const row = await env.DB.prepare("SELECT login FROM users WHERE id = ?1").bind(viewer).first();
    return findUser(env, row.login, viewer);
}

async function removeAccount(env, viewer) {
    requireViewer(viewer);
    await env.DB.prepare("DELETE FROM users WHERE id = ?1").bind(viewer).run();
    return { deleted: true };
}

async function handle(request, env, cors) {
    const url = new URL(request.url);
    const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
    const method = request.method;
    const [resource, key, action] = parts;
    const answer = (body, status = 200) => json(body, status, cors);
    const identifier = () => {
        const value = Number(key);
        if (!Number.isInteger(value) || value < 1) throw new Failure(404, "post");
        return value;
    };

    if (resource === "config" && method === "GET") {
        return answer({ postMax: number(env.POST_MAX), bioMax: number(env.BIO_MAX), pageSize: number(env.PAGE_SIZE) });
    }
    if (resource === "session" && method === "POST") return answer(await createSession(await readJson(request), env));

    const viewer = await viewerOf(request, env);

    if (resource === "posts" && !key) {
        if (method === "GET") return answer(await listPosts(url, env, viewer));
        if (method === "POST") return answer(await createPost(await readJson(request), env, viewer), 201);
    }
    if (resource === "posts" && key && !action) {
        if (method === "GET") return answer(await getPost(env, identifier(), viewer));
        if (method === "DELETE") return answer(await removePost(identifier(), env, viewer));
    }
    if (resource === "posts" && key && action === "like") {
        if (method === "PUT") return answer(await setLike(identifier(), true, env, viewer));
        if (method === "DELETE") return answer(await setLike(identifier(), false, env, viewer));
    }
    if (resource === "users" && !key && method === "GET") return answer(await searchUsers(url, env, viewer));
    if (resource === "users" && key && !action && method === "GET") return answer(await findUser(env, key, viewer));
    if (resource === "users" && key && action === "follow") {
        if (method === "PUT") return answer(await setFollow(key, true, env, viewer));
        if (method === "DELETE") return answer(await setFollow(key, false, env, viewer));
    }
    if (resource === "me" && !key) {
        if (method === "PATCH") return answer(await updateProfile(await readJson(request), env, viewer));
        if (method === "DELETE") return answer(await removeAccount(env, viewer));
    }
    throw new Failure(404, "route");
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
                headers: {
                    ...cors,
                    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
                    "Access-Control-Allow-Headers": "Content-Type, Authorization",
                    "Access-Control-Max-Age": "86400",
                },
            });
        }
        if (!cors) return json({ error: "origin" }, 403);

        try {
            return await handle(request, env, cors);
        } catch (error) {
            if (error instanceof Failure) return json({ error: error.code }, error.status, cors);
            console.error(error);
            return json({ error: "server" }, 500, cors);
        }
    },
};
