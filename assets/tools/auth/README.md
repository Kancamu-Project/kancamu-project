# auth

The sign-in with GitHub of the webs of the site. A static site cannot keep the client secret that GitHub asks for when it trades the code of a sign-in for a token, so this Cloudflare Worker keeps it. It is the one thing that a static site cannot do by itself.

```
POST /token   { code, redirect_uri, code_verifier }   gives { access_token, expires_in, scope }
POST /revoke  { token }                               takes the token back (the user signed out)
```

- Only the webs in `ALLOWED_ORIGINS` (`wrangler.toml`) may ask: the browser says where a request comes from.
- `/token` accepts a `redirect_uri` that is exactly the origin of the asker plus `CALLBACK_PATH`, so GitHub's code is traded only for the callback of an allowed web. The code is traded together with the secret and the verifier of PKCE.
- The refresh token of GitHub never leaves the Worker.
- `/revoke` makes the token stop working at once, also if someone copied it.
- The desktop app opens the same website, so its sign-in is the same one and needs nothing here.

## What is not in the repository

The client id of the OAuth App is public and is in `wrangler.toml`. The client secret is a secret and is never committed:

- locally it is in `assets/tools/auth/.dev.vars` (`GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`), which `.gitignore` ignores;
- on Cloudflare it is a Worker secret (`npx wrangler secret put GITHUB_CLIENT_SECRET`).

`node_modules/` and `.wrangler/` (the state of the local run) are ignored too. A file of the repository that is a key or a certificate (`*.pem`, `*.key`, `*.pfx`, `*.p12`) is ignored.

## Try it here

```
cd assets/tools/auth
npm install
npm run dev          # http://localhost:8787, reads the secret from .dev.vars
```

By default the website on `http://localhost:5173` uses the Worker on Cloudflare too (`worker.local` of the `auth` part of `assets/data/data.js` is its address), which is enough to try the sign-in.
To try changes of this Worker, set `worker.local` to `http://localhost:8787`, run `npm run dev` here, and press "Sign in with GitHub" in `/youmu/`.

## Put it on Cloudflare (once)

```
npx wrangler login
npx wrangler secret put GITHUB_CLIENT_SECRET     # paste the secret when it asks
npx wrangler deploy                              # prints https://kancamu-auth.<your-name>.workers.dev
```

Then write that address in the `auth` part of `assets/data/data.js` (`worker.production`), and publish the website.

## What GitHub needs (OAuth App)

- Homepage URL: `https://kancamu.site`
- Redirect URIs: `https://kancamu.site/youmu/callback.html` and `http://localhost:5173/youmu/callback.html`
- Wildcard matching and Device Flow: off

To change the secret: generate a new one in the OAuth App, then `npx wrangler secret put GITHUB_CLIENT_SECRET` again and update `assets/tools/auth/.dev.vars`.
