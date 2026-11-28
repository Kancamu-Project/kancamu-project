# guyonmu

The server of Guyonmu, the social app of short posts: a Cloudflare Worker (`src/index.js`) with a D1 database (`migrations/`). It keeps the profiles, the posts and replies, the likes, and the follows. The app itself (`/guyonmu/`) is static, like every app of the site.

```
GET    /config                       the limits (postMax, bioMax, pageSize)
POST   /session   { token }          checks the GitHub token with GitHub, gives { session, expires, user }
GET    /posts                        ?feed=following | user=<login> | parent=<id> | q=<text> | cursor=<id>
POST   /posts     { body, parentId } makes a post, or a reply when parentId is set
GET    /posts/:id
DELETE /posts/:id                    only the author; the replies go with it
PUT    /posts/:id/like               DELETE takes the like back
GET    /users?q=<text>               up to 5 people
GET    /users/:login                 the profile, with its counts and whether the viewer follows it
PUT    /users/:login/follow          DELETE stops following
PATCH  /me        { bio }
DELETE /me                           deletes the profile, the posts, the likes, and the follows of the user
```

## How it works

- There is no password and no sign-in screen of its own. The user signs in with GitHub in the account app, like everywhere on the site. The app sends the GitHub token to `POST /session` once; the Worker asks GitHub who it is (`GET /user`), keeps only the id, the login, the name, and the avatar, and answers with a session: the id and an end date, signed with HMAC-SHA256 and `SESSION_SECRET`. The GitHub token is not stored. Every other request carries the session (`Authorization: Bearer`).
- Anyone can read. Writing needs a session. A session of a deleted user does not work any more.
- A post is 1 to `POST_MAX` characters (counted as characters, so an emoji is one), a bio up to `BIO_MAX`. A user can make `POSTS_PER_MINUTE` posts in a minute. The body of a request is at most 8 KB.
- Only the origins of `ALLOWED_ORIGINS` (`wrangler.toml`) may ask. Every query uses bound parameters, and the app writes what it gets with `textContent`, never as HTML.
- The limits and the other numbers are variables of `wrangler.toml`, not code. `GITHUB_API` is the address of GitHub (it can be changed to try the Worker without GitHub).
- The posts and the profiles are public, and they are kept in the database of the Cloudflare account of the owner of the site, not in the repository of the user. A user deletes all of theirs with "Delete my data" on their profile (`DELETE /me`).

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
