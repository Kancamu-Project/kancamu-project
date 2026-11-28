ALTER TABLE posts ADD COLUMN repost_of INTEGER REFERENCES posts(id) ON DELETE CASCADE;
ALTER TABLE posts ADD COLUMN repost_count INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX reposts_by_user ON posts (user_id, repost_of) WHERE repost_of IS NOT NULL;
CREATE INDEX posts_by_repost ON posts (repost_of) WHERE repost_of IS NOT NULL;

CREATE TABLE saves (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, post_id)
);

CREATE INDEX saves_by_post ON saves (post_id);
