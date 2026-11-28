# guyonmu

The server of Guyonmu, the social app of short posts: a Cloudflare Worker (`src/index.js`) with a D1 database (`migrations/`). It keeps the profiles, the posts and replies, the likes, and the follows. The app itself (`/guyonmu/`) is static, like every app of the site.

```
GET    /config                       the limits (postMax, bioMax, pageSize)
POST   /session   { token }          checks the GitHub token with GitHub, gives { session, expires, user }
GET    /posts                        ?feed=following | feed=saved | user=<login> | parent=<id> | q=<text> | cursor=<id>
POST   /media    <the image>         the body is the image itself (Content-Type image/jpeg, png, webp, or gif); gives { key }
GET    /media/:key                   the image (public, with no origin check: an <img> does not send one)
POST   /posts     { body, parentId, images }  makes a post, or a reply when parentId is set; images are keys of /media (up to IMAGES_MAX)
GET    /posts/:id
PATCH  /posts/:id   { body }         only the author, and only in the first EDIT_MINUTES; the post then says that it was edited
DELETE /posts/:id                    only the author; the replies go with it
PUT    /posts/:id/like               DELETE takes the like back
PUT    /posts/:id/repost             shares the post with the followers of the user; DELETE takes it back
POST   /posts/:id/report { reason }  tells the moderators about a post
PUT    /posts/:id/save               keeps the post for the user alone (a private list); DELETE removes it
GET    /users?q=<text>               up to 5 people
GET    /users/:login                 the profile, with its counts and whether the viewer follows it
PUT    /users/:login/follow          DELETE stops following
PUT    /users/:login/block           DELETE unblocks; the same with /mute
GET    /me/lists                     the people the user blocked and muted
GET    /notifications                the notices of the user (cursor=<id>); GET /notifications/count gives { unread }, PUT /notifications/read marks them read
GET    /reports                      moderators only; DELETE /reports/:id dismisses one
PATCH  /me        { bio }
DELETE /me                           deletes the profile, the posts, the likes, and the follows of the user
```

## How it works

- There is no password and no sign-in screen of its own. The user signs in with GitHub in the account app, like everywhere on the site. The app sends the GitHub token to `POST /session` once; the Worker asks GitHub who it is (`GET /user`), keeps only the id, the login, the name, and the avatar, and answers with a session: the id and an end date, signed with HMAC-SHA256 and `SESSION_SECRET`. The GitHub token is not stored. Every other request carries the session (`Authorization: Bearer`).
- Anyone can read. Writing needs a session. A session of a deleted user does not work any more.
- A post is 1 to `POST_MAX` characters (counted as characters, so an emoji is one), a bio up to `BIO_MAX`. A user can make `POSTS_PER_MINUTE` posts in a minute (a repost counts as a post). A repost is a row of the table of posts with `repost_of` set and no text; the timelines show it with the post that it points to, and the post and its reposts go away together. The body of a request is at most 8 KB.
- Only the origins of `ALLOWED_ORIGINS` (`wrangler.toml`) may ask. Every query uses bound parameters, and the app writes what it gets with `textContent`, never as HTML.
- The limits and the other numbers are variables of `wrangler.toml`, not code. `GITHUB_API` is the address of GitHub (it can be changed to try the Worker without GitHub).
- The posts and the profiles are public, and they are kept in the database of the Cloudflare account of the owner of the site, not in the repository of the user. A user deletes all of theirs with "Delete my data" on their profile (`DELETE /me`).

## Images

Images are off by default (`IMAGES_MAX = "0"` in `wrangler.toml`; the app then shows no image button), because R2 asks for a payment card on the Cloudflare account even for its free tier. To turn them on: enable R2 in the dashboard, run `npx wrangler r2 bucket create guyonmu-media`, add to `wrangler.toml` the sections `[[r2_buckets]]` (`binding = "MEDIA"`, `bucket_name = "guyonmu-media"`) and `[triggers]` (`crons = ["17 3 * * *"]`), set `IMAGES_MAX` to a number such as 4, and deploy. The code for it is all here and tested.

The images are in a bucket of R2 (`MEDIA`), and the table `media` says whose each one is and which post it belongs to. The app makes an image smaller before it uploads it (at most `IMAGE_SIDE` pixels on the long side, as WebP; a GIF goes as it is), and the Worker refuses what is not a real JPEG, PNG, WebP, or GIF (it reads the first bytes, not only the type that the client says; SVG is never accepted, because it can carry a script), what is bigger than `IMAGE_MAX_BYTES`, and more than `POSTS_PER_MINUTE` uploads in a minute. An image is attached to one post of its owner, once. It is served with `nosniff`, a Content-Security-Policy that allows nothing, and a cache of a year (the key is random, so it never changes). The images of a deleted post, of its replies, and of a deleted account go away with it. An upload that no post used is deleted by a job that runs every day (`crons` in `wrangler.toml`).

## Blocks, mutes, reports, and moderators

- A mute hides the posts (and the reposts) of a person from the timelines of the one who muted; their profile still shows them. A block hides them in both ways, stops following in both ways, and refuses likes, replies, reposts, and follows between the two.
- A report is one row per reporter and post, with the reason that the reporter wrote. Deleting the post deletes its reports.
- The moderators are the GitHub ids in `MODERATORS` of `wrangler.toml` (the id, not the login, because a login can be renamed and given to someone else; `https://api.github.com/users/<login>` shows the id). A moderator sees the page Reports, dismisses a report, and deletes any post.

## Notifications

A notice is made when someone likes, reposts, replies to, or mentions (`@login`, at most `MENTION_MAX` people in a post) a post of the user, or follows the user. There is one notice for one person, kind, and post (liking twice, or liking again after taking the like back, does not make another), and a notice goes away with what made it: taking the like back, the repost, or the follow, or deleting the reply or the mention removes it. Nobody is told about their own actions, by someone they muted, or by someone with a block between them. The app asks for the number of unread notices when it opens (only if the user already has a session, because reading must not make one) and when the page comes back to the front; it does not ask again and again.

## What is not in the repository

`SESSION_SECRET` is a secret and is never committed:

- locally it is in `assets/tools/guyonmu/.dev.vars`, which `.gitignore` ignores (`SESSION_SECRET=<a long random text>`);
- on Cloudflare it is a Worker secret (`npx wrangler secret put SESSION_SECRET`).

`node_modules/` and `.wrangler/` (the state of the local database) are ignored too. The `database_id` in `wrangler.toml` is not a secret, but it is the one of the database of the owner: put your own there.

## Try it here

```
cd assets/tools/guyonmu
npm install
npm run migrate:local     # makes the local database
npm run dev               # http://localhost:8788
```

The website on `http://localhost:5173` uses it (`api.local` in `guyonmu/data.js`). To try it without a real GitHub account, put `GITHUB_API=http://localhost:9999` in `.dev.vars` and run a small server on that port that answers `GET /user` with `{ "id": 1, "login": "alice", "name": "Alice", "avatar_url": "" }`.

## Put it on Cloudflare (once)

```
npx wrangler login
npx wrangler d1 create guyonmu          # copy the database_id into wrangler.toml
npm run migrate                         # makes the tables
npx wrangler secret put SESSION_SECRET  # paste a long random text
npm run deploy
```

The address that the Worker gets (`https://kancamu-guyonmu.<account>.workers.dev`) is `api.production` in `guyonmu/data.js`. A new file of `migrations/` is applied with `npm run migrate` (never edit one that was already applied).
