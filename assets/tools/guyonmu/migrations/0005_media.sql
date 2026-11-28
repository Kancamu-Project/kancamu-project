CREATE TABLE media (
    key TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    created_at INTEGER NOT NULL
);

CREATE INDEX media_by_post ON media (post_id);
CREATE INDEX media_by_user ON media (user_id, created_at);
