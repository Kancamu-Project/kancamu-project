const encoder = new TextEncoder();
const IMAGE_TYPES = {
    "image/jpeg": { extension: "jpg", starts: [[0xff, 0xd8, 0xff]] },
    "image/png": { extension: "png", starts: [[0x89, 0x50, 0x4e, 0x47]] },
    "image/gif": { extension: "gif", starts: [[0x47, 0x49, 0x46, 0x38]] },
    "image/webp": { extension: "webp", starts: [[0x52, 0x49, 0x46, 0x46]], also: [[8, [0x57, 0x45, 0x42, 0x50]]] },
};
const MEDIA_TYPES = Object.fromEntries(Object.entries(IMAGE_TYPES).map(([type, { extension }]) => [extension, type]));
const MEDIA_KEY = /^\d+-[a-f0-9]{32}\.(jpg|png|gif|webp)$/;
const TAG = /#([\p{L}\p{N}_]+)/gu;
const TAG_ONLY = /^#([\p{L}\p{N}_]+)$/u;
const tagsOf = (text, env) => [...new Set([...text.matchAll(TAG)].map((match) => match[1].toLowerCase()))].slice(0, number(env.HASHTAGS_MAX));
const tagStatements = (env, id, text) => tagsOf(text, env).map((tag) => env.DB.prepare("INSERT OR IGNORE INTO hashtags (post_id, tag, created_at) VALUES (?1, ?2, ?3)").bind(id, tag, Date.now()));
const searchMatch = (text, env) => text.split(" ").filter(Boolean).slice(0, number(env.SEARCH_WORDS)).map((word) => `"${word.replace(/"/g, '""')}"*`).join(" ");
const MENTION = /@([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))/g;
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

const isModerator = (id, env) => (env.MODERATORS || "").split(",").map((item) => item.trim()).includes(String(id));

const requireModerator = (viewer, env) => {
    requireViewer(viewer);
    if (!isModerator(viewer, env)) throw new Failure(403, "moderator");
};

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
    t.id, t.body, t.parent_id AS parentId, t.like_count AS likes, t.reply_count AS replies, t.repost_count AS reposts, t.created_at AS createdAt, t.edited_at AS editedAt, t.quote_of AS quoteOf,
    tu.id AS userId, tu.login, tu.name, tu.avatar,
    (SELECT pu.login FROM posts pp JOIN users pu ON pu.id = pp.user_id WHERE pp.id = t.parent_id) AS parentLogin,
    p.id AS itemId, p.repost_of AS repostOf, u.login AS actorLogin, u.name AS actorName,
    EXISTS(SELECT 1 FROM likes WHERE post_id = t.id AND user_id = ?1) AS liked,
    EXISTS(SELECT 1 FROM saves WHERE post_id = t.id AND user_id = ?1) AS saved,
    EXISTS(SELECT 1 FROM posts rp WHERE rp.repost_of = t.id AND rp.user_id = ?1) AS reposted
    FROM posts p
    JOIN users u ON u.id = p.user_id
    JOIN posts t ON t.id = COALESCE(p.repost_of, p.id)
    JOIN users tu ON tu.id = t.user_id`;

const publicPost = (row, viewer) => ({
    id: row.id,
    itemId: row.itemId,
    body: row.body,
    parentId: row.parentId,
    parentLogin: row.parentLogin,
    likes: row.likes,
    replies: row.replies,
    reposts: row.reposts,
    createdAt: row.createdAt,
    editedAt: row.editedAt,
    liked: !!row.liked,
    saved: !!row.saved,
    reposted: !!row.reposted,
    repostedBy: row.repostOf ? { login: row.actorLogin, name: row.actorName } : null,
    own: viewer !== null && row.userId === viewer,
    user: { login: row.login, name: row.name, avatar: row.avatar },
});

async function hydrate(env, rows, viewer) {
    const ids = [...new Set(rows.map((row) => row.id))];
    const images = new Map();
    if (ids.length) {
        const { results } = await env.DB.prepare(`SELECT post_id AS postId, key FROM media WHERE post_id IN (${ids.map((_, index) => `?${index + 1}`).join(", ")}) ORDER BY rowid`).bind(...ids).all();
        for (const row of results) images.set(row.postId, [...(images.get(row.postId) ?? []), row.key]);
    }
    const quoted = [...new Set(rows.map((row) => row.quoteOf).filter(Boolean))];
    const quotes = new Map();
    if (quoted.length) {
        const { results } = await env.DB.prepare(
            `SELECT p.id, p.body, p.created_at AS createdAt, u.login, u.name, u.avatar FROM posts p JOIN users u ON u.id = p.user_id
            WHERE p.kind != 'repost' AND p.id IN (${quoted.map((_, index) => `?${index + 1}`).join(", ")})`,
        ).bind(...quoted).all();
        for (const row of results) quotes.set(row.id, { id: row.id, body: row.body, createdAt: row.createdAt, user: { login: row.login, name: row.name, avatar: row.avatar } });
    }
    return rows.map((row) => ({ ...publicPost(row, viewer), images: images.get(row.id) ?? [], quote: row.quoteOf ? quotes.get(row.quoteOf) ?? null : null }));
}

async function getPost(env, id, viewer) {
    const row = await env.DB.prepare(`SELECT ${postColumns} WHERE p.id = ?2 AND p.kind != 'repost'`).bind(viewer ?? 0, id).first();
    if (!row) throw new Failure(404, "post");
    return (await hydrate(env, [row], viewer))[0];
}

async function findUser(env, login, viewer) {
    const row = await env.DB.prepare(
        `SELECT u.id, u.login, u.name, u.avatar, u.bio, u.pinned_post_id AS pinnedPostId, u.created_at AS createdAt,
            (SELECT COUNT(*) FROM follows WHERE followee_id = u.id) AS followers,
            (SELECT COUNT(*) FROM follows WHERE follower_id = u.id) AS following,
            (SELECT COUNT(*) FROM posts WHERE user_id = u.id AND kind IN ('post', 'quote')) AS posts,
            EXISTS(SELECT 1 FROM follows WHERE follower_id = ?2 AND followee_id = u.id) AS followed,
            EXISTS(SELECT 1 FROM blocks WHERE user_id = ?2 AND target_id = u.id) AS blocked,
            EXISTS(SELECT 1 FROM mutes WHERE user_id = ?2 AND target_id = u.id) AS muted
        FROM users u WHERE u.login = ?1`,
    ).bind(login, viewer ?? 0).first();
    if (!row) throw new Failure(404, "user");
    return { ...row, followed: !!row.followed, blocked: !!row.blocked, muted: !!row.muted, own: viewer !== null && row.id === viewer };
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
    await env.DB.batch([
        env.DB.prepare("UPDATE users SET login = login || '~' || id WHERE login = ?1 AND id != ?2").bind(profile.login, profile.id),
        env.DB.prepare(
            `INSERT INTO users (id, login, name, avatar, created_at) VALUES (?1, ?2, ?3, ?4, ?5)
            ON CONFLICT(id) DO UPDATE SET login = excluded.login, name = excluded.name, avatar = excluded.avatar`,
        ).bind(profile.id, profile.login, profile.name || profile.login, profile.avatar_url || "", Date.now()),
    ]);
    const expires = Date.now() + number(env.SESSION_DAYS) * DAY;
    return {
        session: await sign({ sub: profile.id, exp: expires }, env),
        expires,
        user: await findUser(env, profile.login, profile.id),
        moderator: isModerator(profile.id, env),
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

    const scope = query.get("scope") || "posts";
    if (!["posts", "replies", "likes"].includes(scope)) throw new Failure(400, "request");
    if (parent) add("p.parent_id = ?", integer(parent));
    else if (scope === "replies") add("p.kind = 'reply'");
    else if (scope === "likes") {
        requireViewer(viewer);
        add("p.kind != 'repost' AND p.id IN (SELECT post_id FROM likes WHERE user_id = ?1)");
    } else if (!query.get("q")) add("p.kind != 'reply'");
    add("p.user_id NOT IN (SELECT target_id FROM blocks WHERE user_id = ?1) AND p.user_id NOT IN (SELECT user_id FROM blocks WHERE target_id = ?1) AND t.user_id NOT IN (SELECT target_id FROM blocks WHERE user_id = ?1) AND t.user_id NOT IN (SELECT user_id FROM blocks WHERE target_id = ?1)");
    if (query.get("user") && scope !== "likes") add("u.login = ?", query.get("user"));
    else add("p.user_id NOT IN (SELECT target_id FROM mutes WHERE user_id = ?1) AND t.user_id NOT IN (SELECT target_id FROM mutes WHERE user_id = ?1)");
    if (query.get("after")) add("p.id > ?", integer(query.get("after")));
    if (query.get("feed") === "following") {
        requireViewer(viewer);
        add("(p.user_id = ?1 OR p.user_id IN (SELECT followee_id FROM follows WHERE follower_id = ?1))");
    }
    if (query.get("feed") === "saved") {
        requireViewer(viewer);
        add("p.kind != 'repost' AND p.id IN (SELECT post_id FROM saves WHERE user_id = ?1)");
    }
    const text = query.get("q") ? clean(query.get("q"), number(env.POST_MAX)) : "";
    if (text) {
        const tag = TAG_ONLY.exec(text);
        if (tag) add("p.kind != 'repost' AND p.id IN (SELECT post_id FROM hashtags WHERE tag = ?)", tag[1].toLowerCase());
        else add("p.kind != 'repost' AND p.id IN (SELECT rowid FROM posts_search WHERE posts_search MATCH ?)", searchMatch(text, env));
    }
    if (cursor) add(parent ? "p.id > ?" : "p.id < ?", cursor);

    const order = parent ? "ASC" : "DESC";
    const { results } = await env.DB.prepare(`SELECT ${postColumns} WHERE ${wheres.join(" AND ")} ORDER BY p.id ${order} LIMIT ${size + 1}`).bind(...values).all();
    const more = results.length > size;
    const posts = await hydrate(env, results.slice(0, size), viewer);
    return { posts, next: more ? posts[posts.length - 1].itemId : null };
}

async function createPost(body, env, viewer) {
    requireViewer(viewer);
    const text = clean(body.body ?? "", number(env.POST_MAX), { multiline: true });
    const keys = body.images == null ? [] : body.images;
    if (!Array.isArray(keys) || keys.length > number(env.IMAGES_MAX) || new Set(keys).size !== keys.length || keys.some((key) => typeof key !== "string" || !MEDIA_KEY.test(key))) throw new Failure(400, "request");
    if (!text && !keys.length) throw new Failure(400, "empty");
    if (keys.length) {
        const { results } = await env.DB.prepare(`SELECT key FROM media WHERE user_id = ?1 AND post_id IS NULL AND key IN (${keys.map((_, index) => `?${index + 2}`).join(", ")})`).bind(viewer, ...keys).all();
        if (results.length !== keys.length) throw new Failure(400, "request");
    }
    const parent = body.parentId == null ? null : integer(body.parentId);
    const quote = body.quoteOf == null ? null : integer(body.quoteOf);
    if (parent !== null && quote !== null) throw new Failure(400, "request");
    let quoteOwner = null;
    if (quote !== null) {
        const found = await original(env, quote);
        await refuseBlocked(env, viewer, found.userId);
        quoteOwner = found.userId;
    }
    let parentOwner = null;
    if (parent !== null) {
        const found = await original(env, parent);
        await refuseBlocked(env, viewer, found.userId);
        parentOwner = found.userId;
    }
    const recent = await env.DB.prepare("SELECT COUNT(*) AS total FROM posts WHERE user_id = ?1 AND created_at > ?2").bind(viewer, Date.now() - MINUTE).first();
    if (recent.total >= number(env.POSTS_PER_MINUTE)) throw new Failure(429, "rate");
    const [inserted] = await env.DB.batch([
        env.DB.prepare("INSERT INTO posts (kind, user_id, parent_id, quote_of, body, created_at) VALUES (?6, ?1, ?2, ?5, ?3, ?4) RETURNING id").bind(viewer, parent, text, Date.now(), quote, parent !== null ? "reply" : quote !== null ? "quote" : "post"),
        env.DB.prepare("UPDATE posts SET reply_count = (SELECT COUNT(*) FROM posts WHERE parent_id = ?1) WHERE id = ?1").bind(parent ?? 0),
    ]);
    const id = inserted.results[0].id;
    const mentioned = [...new Set([...text.matchAll(MENTION)].map((match) => match[1].toLowerCase()))].slice(0, number(env.MENTION_MAX));
    const people = mentioned.length
        ? (await env.DB.prepare(`SELECT id FROM users WHERE login IN (${mentioned.map((_, index) => `?${index + 1}`).join(", ")})`).bind(...mentioned).all()).results
        : [];
    const notices = people.filter((person) => person.id !== parentOwner).map((person) => notify(env, person.id, viewer, "mention", id));
    if (parentOwner !== null) notices.unshift(notify(env, parentOwner, viewer, "reply", id));
    if (quoteOwner !== null) notices.unshift(notify(env, quoteOwner, viewer, "quote", id));
    const attach = keys.map((key) => env.DB.prepare("UPDATE media SET post_id = ?1 WHERE key = ?2 AND user_id = ?3 AND post_id IS NULL").bind(id, key, viewer));
    const tags = tagStatements(env, id, text);
    if (notices.length || attach.length || tags.length) await env.DB.batch([...attach, ...tags, ...notices]);
    return getPost(env, id, viewer);
}

async function mediaKeys(env, seed, ...binds) {
    const { results } = await env.DB.prepare(
        `WITH RECURSIVE tree(id) AS (${seed} UNION ALL SELECT p.id FROM posts p JOIN tree t ON p.parent_id = t.id)
        SELECT key FROM media WHERE post_id IN (SELECT id FROM tree)`,
    ).bind(...binds).all();
    return results.map((row) => row.key);
}

const hasBytes = (bytes, offset, expected) => expected.every((value, index) => bytes[offset + index] === value);

async function uploadMedia(request, env, viewer) {
    requireViewer(viewer);
    if (!env.MEDIA || number(env.IMAGES_MAX) < 1) throw new Failure(404, "images");
    const type = (request.headers.get("Content-Type") || "").split(";")[0].trim().toLowerCase();
    const kind = IMAGE_TYPES[type];
    if (!kind) throw new Failure(415, "type");
    const length = Number(request.headers.get("Content-Length"));
    if (!Number.isInteger(length) || length < 1 || length > number(env.IMAGE_MAX_BYTES)) throw new Failure(413, "size");
    const recent = await env.DB.prepare("SELECT COUNT(*) AS total FROM media WHERE user_id = ?1 AND created_at > ?2").bind(viewer, Date.now() - MINUTE).first();
    if (recent.total >= number(env.POSTS_PER_MINUTE)) throw new Failure(429, "rate");
    const bytes = new Uint8Array(await request.arrayBuffer());
    if (bytes.length !== length || !kind.starts.some((start) => hasBytes(bytes, 0, start)) || !(kind.also ?? []).every(([offset, expected]) => hasBytes(bytes, offset, expected))) throw new Failure(415, "type");
    const key = `${viewer}-${[...crypto.getRandomValues(new Uint8Array(16))].map((byte) => byte.toString(16).padStart(2, "0")).join("")}.${kind.extension}`;
    await env.MEDIA.put(key, bytes, { httpMetadata: { contentType: type } });
    await env.DB.prepare("INSERT INTO media (key, user_id, type, created_at) VALUES (?1, ?2, ?3, ?4)").bind(key, viewer, type, Date.now()).run();
    return { key };
}

async function serveMedia(key, env) {
    if (!env.MEDIA || !MEDIA_KEY.test(key)) return new Response(null, { status: 404 });
    const object = await env.MEDIA.get(key);
    if (!object) return new Response(null, { status: 404 });
    return new Response(object.body, {
        headers: {
            "Content-Type": MEDIA_TYPES[key.split(".").pop()],
            "Cache-Control": "public, max-age=31536000, immutable",
            "X-Content-Type-Options": "nosniff",
            "Content-Security-Policy": "default-src 'none'; sandbox",
            "Cross-Origin-Resource-Policy": "cross-origin",
        },
    });
}

async function removePost(id, env, viewer) {
    requireViewer(viewer);
    const row = await env.DB.prepare("SELECT user_id AS userId, parent_id AS parentId, body FROM posts WHERE id = ?1").bind(id).first();
    if (!row) throw new Failure(404, "post");
    if (row.userId !== viewer && !isModerator(viewer, env)) throw new Failure(403, "owner");
    const keys = await mediaKeys(env, "SELECT ?1", id);
    await env.DB.batch([
        ...(row.userId !== viewer ? [env.DB.prepare("INSERT INTO moderation_log (moderator_id, action, post_id, author_id, excerpt, created_at) VALUES (?1, 'delete_post', ?2, ?3, ?4, ?5)").bind(viewer, id, row.userId, row.body.slice(0, number(env.EXCERPT_MAX)), Date.now())] : []),
        env.DB.prepare("DELETE FROM posts WHERE id = ?1").bind(id),
        env.DB.prepare("UPDATE posts SET reply_count = (SELECT COUNT(*) FROM posts WHERE parent_id = ?1) WHERE id = ?1").bind(row.parentId ?? 0),
    ]);
    if (keys.length) await env.MEDIA?.delete(keys);
    return { deleted: true };
}

const notify = (env, recipient, actor, kind, postId) => env.DB.prepare(
    `INSERT OR IGNORE INTO notifications (user_id, actor_id, kind, post_id, created_at)
    SELECT ?1, ?2, ?3, ?4, ?5
    WHERE ?1 != ?2
        AND NOT EXISTS (SELECT 1 FROM mutes WHERE user_id = ?1 AND target_id = ?2)
        AND NOT EXISTS (SELECT 1 FROM blocks WHERE (user_id = ?1 AND target_id = ?2) OR (user_id = ?2 AND target_id = ?1))`,
).bind(recipient, actor, kind, postId, Date.now());

const unnotify = (env, recipient, actor, kind, postId) => env.DB.prepare(
    "DELETE FROM notifications WHERE user_id = ?1 AND actor_id = ?2 AND kind = ?3 AND COALESCE(post_id, 0) = ?4",
).bind(recipient, actor, kind, postId ?? 0);

async function editPost(id, body, env, viewer) {
    requireViewer(viewer);
    const row = await env.DB.prepare("SELECT user_id AS userId, created_at AS createdAt FROM posts WHERE id = ?1 AND kind != 'repost'").bind(id).first();
    if (!row) throw new Failure(404, "post");
    if (row.userId !== viewer) throw new Failure(403, "owner");
    if (Date.now() - row.createdAt > number(env.EDIT_MINUTES) * MINUTE) throw new Failure(403, "window");
    const text = clean(body.body ?? "", number(env.POST_MAX), { multiline: true });
    const image = await env.DB.prepare("SELECT 1 AS found FROM media WHERE post_id = ?1 LIMIT 1").bind(id).first();
    if (!text && !image) throw new Failure(400, "empty");
    await env.DB.batch([
        env.DB.prepare("UPDATE posts SET body = ?2, edited_at = ?3 WHERE id = ?1").bind(id, text, Date.now()),
        env.DB.prepare("DELETE FROM hashtags WHERE post_id = ?1").bind(id),
        ...tagStatements(env, id, text),
    ]);
    return getPost(env, id, viewer);
}

const original = async (env, id) => {
    const found = await env.DB.prepare("SELECT id, user_id AS userId FROM posts WHERE id = ?1 AND kind != 'repost'").bind(id).first();
    if (!found) throw new Failure(404, "post");
    return found;
};

async function refuseBlocked(env, viewer, other) {
    const blocked = await env.DB.prepare("SELECT 1 AS found FROM blocks WHERE (user_id = ?1 AND target_id = ?2) OR (user_id = ?2 AND target_id = ?1)").bind(viewer, other).first();
    if (blocked) throw new Failure(403, "blocked");
}

async function setLike(id, on, env, viewer) {
    requireViewer(viewer);
    const found = await original(env, id);
    if (on) await refuseBlocked(env, viewer, found.userId);
    await env.DB.batch([
        on
            ? env.DB.prepare("INSERT OR IGNORE INTO likes (user_id, post_id, created_at) VALUES (?1, ?2, ?3)").bind(viewer, id, Date.now())
            : env.DB.prepare("DELETE FROM likes WHERE user_id = ?1 AND post_id = ?2").bind(viewer, id),
        env.DB.prepare("UPDATE posts SET like_count = (SELECT COUNT(*) FROM likes WHERE post_id = ?1) WHERE id = ?1").bind(id),
        on ? notify(env, found.userId, viewer, "like", id) : unnotify(env, found.userId, viewer, "like", id),
    ]);
    return getPost(env, id, viewer);
}

async function setRepost(id, on, env, viewer) {
    requireViewer(viewer);
    const found = await original(env, id);
    if (on) {
        await refuseBlocked(env, viewer, found.userId);
        const recent = await env.DB.prepare("SELECT COUNT(*) AS total FROM posts WHERE user_id = ?1 AND created_at > ?2").bind(viewer, Date.now() - MINUTE).first();
        if (recent.total >= number(env.POSTS_PER_MINUTE)) throw new Failure(429, "rate");
    }
    await env.DB.batch([
        on
            ? env.DB.prepare("INSERT OR IGNORE INTO posts (kind, user_id, repost_of, body, created_at) VALUES ('repost', ?1, ?2, '', ?3)").bind(viewer, id, Date.now())
            : env.DB.prepare("DELETE FROM posts WHERE user_id = ?1 AND repost_of = ?2").bind(viewer, id),
        env.DB.prepare("UPDATE posts SET repost_count = (SELECT COUNT(*) FROM posts WHERE repost_of = ?1) WHERE id = ?1").bind(id),
        on ? notify(env, found.userId, viewer, "repost", id) : unnotify(env, found.userId, viewer, "repost", id),
    ]);
    return getPost(env, id, viewer);
}

async function setSave(id, on, env, viewer) {
    requireViewer(viewer);
    await original(env, id);
    await (on
        ? env.DB.prepare("INSERT OR IGNORE INTO saves (user_id, post_id, created_at) VALUES (?1, ?2, ?3)").bind(viewer, id, Date.now())
        : env.DB.prepare("DELETE FROM saves WHERE user_id = ?1 AND post_id = ?2").bind(viewer, id)
    ).run();
    return getPost(env, id, viewer);
}

async function setFollow(login, on, env, viewer) {
    requireViewer(viewer);
    const target = await findUser(env, login, viewer);
    if (target.id === viewer) throw new Failure(400, "self");
    if (on) await refuseBlocked(env, viewer, target.id);
    await env.DB.batch([
        on
            ? env.DB.prepare("INSERT OR IGNORE INTO follows (follower_id, followee_id, created_at) VALUES (?1, ?2, ?3)").bind(viewer, target.id, Date.now())
            : env.DB.prepare("DELETE FROM follows WHERE follower_id = ?1 AND followee_id = ?2").bind(viewer, target.id),
        on ? notify(env, target.id, viewer, "follow", null) : unnotify(env, target.id, viewer, "follow", null),
    ]);
    return findUser(env, login, viewer);
}

const RELATIONS = { block: "blocks", mute: "mutes" };

async function setRelation(kind, login, on, env, viewer) {
    requireViewer(viewer);
    const table = RELATIONS[kind];
    const target = await findUser(env, login, viewer);
    if (target.id === viewer) throw new Failure(400, "self");
    const statements = [
        on
            ? env.DB.prepare(`INSERT OR IGNORE INTO ${table} (user_id, target_id, created_at) VALUES (?1, ?2, ?3)`).bind(viewer, target.id, Date.now())
            : env.DB.prepare(`DELETE FROM ${table} WHERE user_id = ?1 AND target_id = ?2`).bind(viewer, target.id),
    ];
    if (on && kind === "block") statements.push(env.DB.prepare("DELETE FROM follows WHERE (follower_id = ?1 AND followee_id = ?2) OR (follower_id = ?2 AND followee_id = ?1)").bind(viewer, target.id));
    await env.DB.batch(statements);
    return findUser(env, login, viewer);
}

async function listRelations(env, viewer) {
    requireViewer(viewer);
    const read = async (table) => (await env.DB.prepare(`SELECT u.login, u.name, u.avatar FROM ${table} r JOIN users u ON u.id = r.target_id WHERE r.user_id = ?1 ORDER BY r.created_at DESC`).bind(viewer).all()).results;
    return { groups: [{ id: "blocked", people: await read("blocks") }, { id: "muted", people: await read("mutes") }] };
}

async function reportPost(id, body, env, viewer) {
    requireViewer(viewer);
    const reason = clean(body.reason ?? "", number(env.REPORT_MAX), { multiline: true });
    const found = await original(env, id);
    if (found.userId === viewer) throw new Failure(400, "self");
    const recent = await env.DB.prepare("SELECT COUNT(*) AS total FROM reports WHERE reporter_id = ?1 AND created_at > ?2").bind(viewer, Date.now() - MINUTE).first();
    if (recent.total >= number(env.POSTS_PER_MINUTE)) throw new Failure(429, "rate");
    await env.DB.prepare("INSERT OR IGNORE INTO reports (reporter_id, post_id, reason, created_at) VALUES (?1, ?2, ?3, ?4)").bind(viewer, id, reason, Date.now()).run();
    return { reported: true };
}

async function listReports(url, env, viewer) {
    requireModerator(viewer, env);
    const size = number(env.PAGE_SIZE);
    const cursor = url.searchParams.get("cursor") ? integer(url.searchParams.get("cursor")) : 0;
    const { results } = await env.DB.prepare(
        `SELECT r.id, r.reason, r.post_id AS postId, r.created_at AS createdAt, u.login AS reporterLogin, u.name AS reporterName
        FROM reports r JOIN users u ON u.id = r.reporter_id WHERE r.status = 'open' AND (?1 = 0 OR r.id < ?1) ORDER BY r.id DESC LIMIT ${size + 1}`,
    ).bind(cursor).all();
    const rows = results.slice(0, size);
    const found = rows.length ? await env.DB.batch(rows.map((row) => env.DB.prepare(`SELECT ${postColumns} WHERE p.id = ?2 AND p.kind != 'repost'`).bind(viewer, row.postId))) : [];
    const posts = (await hydrate(env, found.map((item) => item.results[0]).filter(Boolean), viewer)).reduce((map, post) => map.set(post.id, post), new Map());
    const reports = rows.filter((row) => posts.has(row.postId)).map((row) => ({
        id: row.id,
        reason: row.reason,
        createdAt: row.createdAt,
        reporter: { login: row.reporterLogin, name: row.reporterName },
        post: posts.get(row.postId),
    }));
    return { reports, next: results.length > size ? rows[rows.length - 1].id : null };
}

async function dismissReport(id, env, viewer) {
    requireModerator(viewer, env);
    const report = await env.DB.prepare("SELECT post_id AS postId FROM reports WHERE id = ?1 AND status = 'open'").bind(id).first();
    if (!report) throw new Failure(404, "report");
    await env.DB.batch([
        env.DB.prepare("UPDATE reports SET status = 'dismissed', resolved_by = ?2, resolved_at = ?3 WHERE id = ?1").bind(id, viewer, Date.now()),
        env.DB.prepare("INSERT INTO moderation_log (moderator_id, action, post_id, author_id, excerpt, created_at) SELECT ?1, 'dismiss_report', id, user_id, substr(body, 1, ?3), ?4 FROM posts WHERE id = ?2").bind(viewer, report.postId, number(env.EXCERPT_MAX), Date.now()),
    ]);
    return { dismissed: true };
}

async function listNotifications(url, env, viewer) {
    requireViewer(viewer);
    const size = number(env.PAGE_SIZE);
    const cursor = url.searchParams.get("cursor") ? integer(url.searchParams.get("cursor")) : 0;
    const { results } = await env.DB.prepare(
        `SELECT n.id, n.kind, n.read, n.post_id AS postId, n.created_at AS createdAt, u.login, u.name, u.avatar
        FROM notifications n JOIN users u ON u.id = n.actor_id
        WHERE n.user_id = ?1 AND (?2 = 0 OR n.id < ?2) ORDER BY n.id DESC LIMIT ${size + 1}`,
    ).bind(viewer, cursor).all();
    const rows = results.slice(0, size);
    const withPost = rows.filter((row) => row.postId);
    const found = withPost.length ? await env.DB.batch(withPost.map((row) => env.DB.prepare(`SELECT ${postColumns} WHERE p.id = ?2 AND p.kind != 'repost'`).bind(viewer, row.postId))) : [];
    const posts = (await hydrate(env, found.map((item) => item.results[0]).filter(Boolean), viewer)).reduce((map, post) => map.set(post.id, post), new Map());
    const notifications = rows.map((row) => {
        const post = row.postId ? posts.get(row.postId) ?? null : null;
        return {
            id: row.id,
            kind: row.kind,
            read: !!row.read,
            createdAt: row.createdAt,
            actor: { login: row.login, name: row.name, avatar: row.avatar },
            post,
        };
    });
    return { notifications, next: results.length > size ? rows[rows.length - 1].id : null };
}

async function countNotifications(env, viewer) {
    requireViewer(viewer);
    const row = await env.DB.prepare("SELECT COUNT(*) AS unread FROM notifications WHERE user_id = ?1 AND read = 0").bind(viewer).first();
    return { unread: row.unread };
}

async function readNotifications(env, viewer) {
    requireViewer(viewer);
    await env.DB.prepare("UPDATE notifications SET read = 1 WHERE user_id = ?1 AND read = 0").bind(viewer).run();
    return { unread: 0 };
}

async function listPeople(login, kind, url, env, viewer) {
    const target = await findUser(env, login, viewer);
    const size = number(env.PAGE_SIZE);
    const cursor = url.searchParams.get("cursor") ? integer(url.searchParams.get("cursor")) : 0;
    const [near, far] = kind === "followers" ? ["followee_id", "follower_id"] : ["follower_id", "followee_id"];
    const { results } = await env.DB.prepare(
        `SELECT f.rowid AS position, u.login, u.name, u.avatar FROM follows f JOIN users u ON u.id = f.${far}
        WHERE f.${near} = ?1 AND (?2 = 0 OR f.rowid < ?2)
            AND u.id NOT IN (SELECT target_id FROM blocks WHERE user_id = ?3) AND u.id NOT IN (SELECT user_id FROM blocks WHERE target_id = ?3)
        ORDER BY f.rowid DESC LIMIT ${size + 1}`,
    ).bind(target.id, cursor, viewer ?? 0).all();
    const rows = results.slice(0, size);
    return { users: rows.map((row) => ({ login: row.login, name: row.name, avatar: row.avatar })), next: results.length > size ? rows[rows.length - 1].position : null };
}

async function setPin(id, on, env, viewer) {
    requireViewer(viewer);
    const found = await original(env, id);
    if (found.userId !== viewer) throw new Failure(403, "owner");
    await env.DB.prepare("UPDATE users SET pinned_post_id = ?2 WHERE id = ?1").bind(viewer, on ? id : null).run();
    return getPost(env, id, viewer);
}

async function explore(env, viewer) {
    const limit = number(env.PEOPLE_MAX);
    const hidden = "AND u.id NOT IN (SELECT target_id FROM blocks WHERE user_id = ?1) AND u.id NOT IN (SELECT user_id FROM blocks WHERE target_id = ?1)";
    const known = "AND u.id != ?1 AND u.id NOT IN (SELECT followee_id FROM follows WHERE follower_id = ?1)";
    const friends = (await env.DB.prepare(
        `SELECT u.id, u.login, u.name, u.avatar, COUNT(*) AS score FROM follows mine
        JOIN follows theirs ON theirs.follower_id = mine.followee_id JOIN users u ON u.id = theirs.followee_id
        WHERE mine.follower_id = ?1 ${known} ${hidden} GROUP BY u.id ORDER BY score DESC, u.id DESC LIMIT ?2`,
    ).bind(viewer ?? 0, limit).all()).results;
    const popular = friends.length >= limit ? [] : (await env.DB.prepare(
        `SELECT u.id, u.login, u.name, u.avatar, (SELECT COUNT(*) FROM follows WHERE followee_id = u.id) AS score FROM users u
        WHERE 1 = 1 ${known} ${hidden} AND u.id NOT IN (${[0, ...friends.map((row) => row.id)].join(", ")}) ORDER BY score DESC, u.id DESC LIMIT ?2`,
    ).bind(viewer ?? 0, limit - friends.length).all()).results;
    const { results: trending } = await env.DB.prepare(
        `SELECT h.tag, COUNT(*) AS uses FROM hashtags h JOIN posts p ON p.id = h.post_id
        WHERE h.created_at > ?1 AND p.kind IN ('post', 'quote') GROUP BY h.tag ORDER BY uses DESC, h.tag LIMIT ?2`,
    ).bind(Date.now() - number(env.TRENDING_DAYS) * DAY, number(env.TRENDING_MAX)).all();
    const tags = trending.map((row) => ({ tag: `#${row.tag}`, count: row.uses }));
    return {
        groups: [
            { id: "suggested", people: [...friends, ...popular].map((row) => ({ login: row.login, name: row.name, avatar: row.avatar })) },
            { id: "trending", tags },
        ],
    };
}

async function searchUsers(url, env, viewer) {
    const text = clean(url.searchParams.get("q") || "", number(env.POST_MAX));
    if (!text) return { users: [] };
    const { results } = await env.DB.prepare(
        `SELECT login, name, avatar FROM users WHERE login LIKE ?1 ESCAPE '\\' OR name LIKE ?1 ESCAPE '\\' ORDER BY login LIMIT ?2`,
    ).bind(like(text), number(env.PEOPLE_MAX)).all();
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
    const keys = new Set([
        ...(await mediaKeys(env, "SELECT id FROM posts WHERE user_id = ?1", viewer)),
        ...(await env.DB.prepare("SELECT key FROM media WHERE user_id = ?1").bind(viewer).all()).results.map((row) => row.key),
    ]);
    await env.DB.prepare("DELETE FROM users WHERE id = ?1").bind(viewer).run();
    if (keys.size) await env.MEDIA?.delete([...keys]);
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
        return answer({
            postMax: number(env.POST_MAX),
            bioMax: number(env.BIO_MAX),
            pageSize: number(env.PAGE_SIZE),
            imagesMax: number(env.IMAGES_MAX),
            imageMaxBytes: number(env.IMAGE_MAX_BYTES),
            imageSide: number(env.IMAGE_SIDE),
            editMinutes: number(env.EDIT_MINUTES),
        });
    }
    if (resource === "session" && method === "POST") return answer(await createSession(await readJson(request), env));

    const viewer = await viewerOf(request, env);

    if (resource === "media" && !key && method === "POST") return answer(await uploadMedia(request, env, viewer), 201);
    if (resource === "posts" && !key) {
        if (method === "GET") return answer(await listPosts(url, env, viewer));
        if (method === "POST") return answer(await createPost(await readJson(request), env, viewer), 201);
    }
    if (resource === "posts" && key && !action) {
        if (method === "GET") return answer(await getPost(env, identifier(), viewer));
        if (method === "PATCH") return answer(await editPost(identifier(), await readJson(request), env, viewer));
        if (method === "DELETE") return answer(await removePost(identifier(), env, viewer));
    }
    if (resource === "posts" && key && action === "like") {
        if (method === "PUT") return answer(await setLike(identifier(), true, env, viewer));
        if (method === "DELETE") return answer(await setLike(identifier(), false, env, viewer));
    }
    if (resource === "posts" && key && action === "repost") {
        if (method === "PUT") return answer(await setRepost(identifier(), true, env, viewer));
        if (method === "DELETE") return answer(await setRepost(identifier(), false, env, viewer));
    }
    if (resource === "posts" && key && action === "save") {
        if (method === "PUT") return answer(await setSave(identifier(), true, env, viewer));
        if (method === "DELETE") return answer(await setSave(identifier(), false, env, viewer));
    }
    if (resource === "posts" && key && action === "report" && method === "POST") return answer(await reportPost(identifier(), await readJson(request), env, viewer));
    if (resource === "reports" && !key && method === "GET") return answer(await listReports(url, env, viewer));
    if (resource === "reports" && key && !action && method === "DELETE") return answer(await dismissReport(identifier(), env, viewer));
    if (resource === "users" && key && (action === "followers" || action === "following") && method === "GET") return answer(await listPeople(key, action, url, env, viewer));
    if (resource === "users" && key && (action === "block" || action === "mute")) {
        if (method === "PUT") return answer(await setRelation(action, key, true, env, viewer));
        if (method === "DELETE") return answer(await setRelation(action, key, false, env, viewer));
    }
    if (resource === "me" && key === "lists" && method === "GET") return answer(await listRelations(env, viewer));
    if (resource === "notifications" && !key && method === "GET") return answer(await listNotifications(url, env, viewer));
    if (resource === "notifications" && key === "count" && method === "GET") return answer(await countNotifications(env, viewer));
    if (resource === "notifications" && key === "read" && method === "PUT") return answer(await readNotifications(env, viewer));
    if (resource === "explore" && method === "GET") return answer(await explore(env, viewer));
    if (resource === "posts" && key && action === "pin") {
        if (method === "PUT") return answer(await setPin(identifier(), true, env, viewer));
        if (method === "DELETE") return answer(await setPin(identifier(), false, env, viewer));
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
    async scheduled(event, env) {
        for (;;) {
            const { results } = await env.DB.prepare("SELECT key FROM media WHERE post_id IS NULL AND created_at < ?1 LIMIT 50").bind(Date.now() - DAY).all();
            if (!results.length) return;
            const keys = results.map((row) => row.key);
            await env.MEDIA.delete(keys);
            await env.DB.prepare(`DELETE FROM media WHERE key IN (${keys.map((_, index) => `?${index + 1}`).join(", ")})`).bind(...keys).run();
        }
    },

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
        const [first, second] = new URL(request.url).pathname.split("/").filter(Boolean);
        if (request.method === "GET" && first === "media" && second) return serveMedia(decodeURIComponent(second), env);
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
