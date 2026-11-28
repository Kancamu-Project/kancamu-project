CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    login TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name TEXT NOT NULL,
    avatar TEXT NOT NULL,
    bio TEXT NOT NULL DEFAULT '',
    pinned_post_id INTEGER REFERENCES posts(id) ON DELETE SET NULL,
    created_at INTEGER NOT NULL
);

CREATE TABLE posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL CHECK (kind IN ('post', 'reply', 'repost', 'quote')),
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    parent_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
    repost_of INTEGER REFERENCES posts(id) ON DELETE CASCADE,
    quote_of INTEGER REFERENCES posts(id) ON DELETE SET NULL,
    body TEXT NOT NULL DEFAULT '',
    like_count INTEGER NOT NULL DEFAULT 0,
    reply_count INTEGER NOT NULL DEFAULT 0,
    repost_count INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    edited_at INTEGER,
    CHECK ((kind = 'reply') = (parent_id IS NOT NULL)),
    CHECK ((kind = 'repost') = (repost_of IS NOT NULL)),
    CHECK (kind = 'quote' OR quote_of IS NULL)
);

CREATE INDEX posts_by_user ON posts (user_id, id DESC);
CREATE INDEX posts_by_kind ON posts (kind, id DESC);
CREATE INDEX posts_by_parent ON posts (parent_id, id) WHERE parent_id IS NOT NULL;
CREATE INDEX posts_by_repost ON posts (repost_of) WHERE repost_of IS NOT NULL;
CREATE UNIQUE INDEX reposts_by_user ON posts (user_id, repost_of) WHERE repost_of IS NOT NULL;
CREATE INDEX posts_by_quote ON posts (quote_of) WHERE quote_of IS NOT NULL;

CREATE TABLE hashtags (
    post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    tag TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (post_id, tag)
);

CREATE INDEX hashtags_by_tag ON hashtags (tag, post_id DESC);
CREATE INDEX hashtags_by_time ON hashtags (created_at);

CREATE VIRTUAL TABLE posts_search USING fts5(body, content = 'posts', content_rowid = 'id', tokenize = 'unicode61 remove_diacritics 2');

CREATE TRIGGER posts_search_insert AFTER INSERT ON posts WHEN new.kind != 'repost' BEGIN
    INSERT INTO posts_search (rowid, body) VALUES (new.id, new.body);
END;

CREATE TRIGGER posts_search_delete AFTER DELETE ON posts WHEN old.kind != 'repost' BEGIN
    INSERT INTO posts_search (posts_search, rowid, body) VALUES ('delete', old.id, old.body);
END;

CREATE TRIGGER posts_search_update AFTER UPDATE OF body ON posts WHEN new.kind != 'repost' BEGIN
    INSERT INTO posts_search (posts_search, rowid, body) VALUES ('delete', old.id, old.body);
    INSERT INTO posts_search (rowid, body) VALUES (new.id, new.body);
END;

CREATE TABLE likes (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, post_id)
);

CREATE INDEX likes_by_post ON likes (post_id);

CREATE TABLE saves (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, post_id)
);

CREATE INDEX saves_by_post ON saves (post_id);

CREATE TABLE follows (
    follower_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    followee_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (follower_id, followee_id),
    CHECK (follower_id != followee_id)
);

CREATE INDEX follows_by_followee ON follows (followee_id);

CREATE TABLE blocks (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    target_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, target_id),
    CHECK (user_id != target_id)
);

CREATE INDEX blocks_by_target ON blocks (target_id);

CREATE TABLE mutes (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    target_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, target_id),
    CHECK (user_id != target_id)
);

CREATE TABLE notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    actor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('like', 'repost', 'follow', 'reply', 'mention', 'quote')),
    post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
    read INTEGER NOT NULL DEFAULT 0 CHECK (read IN (0, 1)),
    created_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX notifications_unique ON notifications (user_id, actor_id, kind, COALESCE(post_id, 0));
CREATE INDEX notifications_by_user ON notifications (user_id, id DESC);

CREATE TABLE reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reporter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    reason TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'dismissed')),
    resolved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    resolved_at INTEGER,
    created_at INTEGER NOT NULL,
    UNIQUE (reporter_id, post_id)
);

CREATE INDEX reports_by_status ON reports (status, id DESC);

CREATE TABLE moderation_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    moderator_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action TEXT NOT NULL CHECK (action IN ('delete_post', 'dismiss_report')),
    post_id INTEGER NOT NULL,
    author_id INTEGER NOT NULL,
    excerpt TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL
);

CREATE TABLE media (
    key TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    created_at INTEGER NOT NULL
);

CREATE INDEX media_by_post ON media (post_id);
CREATE INDEX media_by_user ON media (user_id, created_at);
