# BlurtDiary — Vite + Vue 3 + TypeScript

A single-user Blurt diary (blog) hosted on GitHub Pages. The user is selected with a parameter: `?user=dotevo`.
Optional: `&cat=<category id>`, `&post=<permlink>`, `&recent=auto|replies|own|scan`.
Posts and comments are also mirrored on Hive and Steem (see [docs/MULTICHAIN.md](docs/MULTICHAIN.md)); Blurt stays the primary chain.

```bash
npm install
npm run dev      # local
npm run build    # vue-tsc + vite build -> dist/
```
Deploy: `.github/workflows/deploy.yml` (same as BlurtForum) — Settings → Pages → Source: **GitHub Actions**.
For a custom domain / user site set the repo variable `VITE_BASE=/`.

## Blog configuration
The owner logs in on their own blog (`?user=theirname`) and clicks **⚙** — the configurator (title, description, cover, language, light/dark
palettes and colours, font, layout, sidebar, a pinned post, recommended blogs, a monthly archive, a Follow button (on-chain), ten more look options (corners, cards, spacing, width, columns, header, text size, headings, images, reward amounts), categories, links, accounts on other blockchains) previews changes live, and **Save** publishes a
readable post `@theirname/blurt-diary-config` (payout disabled). The blog finds it by its fixed permlink, so nothing has to be added to the
profile and a *posting* key is enough. The full format, manual editing and all parameters are described in
**`src/components/DocsView.vue`** (`?view=docs`, "Documentation" link in the footer).

Writing posts: **✍ Write** (Markdown, preview, image upload, manual tags, optional community, draft kept in the browser).
Beneficiaries: 1% `dotevo` (dev tip, can be switched off at the bottom of the form) + 3% community for threads in a community.

## Multi-chain
Blurt is always primary (all listings and queries). Hive and Steem are mirrors addressed by the same permlink; per-chain RPC code lives in
`src/lib/chains/` (one file per chain). Owner account names on other chains are stored in the blog settings (`chains:` section).
Rules, code layout and how to add a chain: [docs/MULTICHAIN.md](docs/MULTICHAIN.md).

## API tests (curl) — recent comments
The result tells which strategy to pick for the "Recent comments" panel (default `auto`: `replies`, and `scan` when empty).
Note: `bridge.*` is called directly (`"method":"bridge.xxx"`, params as an object).

```bash
RPC=https://rpc.drakernoise.com
call() { curl -s -X POST "$RPC" -H 'Content-Type: application/json' -d "$1" | head -c ${2:-2500}; echo; }

# 1) the user's posts
call '{"jsonrpc":"2.0","id":1,"method":"bridge.get_account_posts","params":{"sort":"posts","account":"dotevo","limit":2}}'
# A) comments UNDER the user's posts
call '{"jsonrpc":"2.0","id":1,"method":"bridge.get_account_posts","params":{"sort":"replies","account":"dotevo","limit":5}}'
# B) the user's own comments
call '{"jsonrpc":"2.0","id":1,"method":"bridge.get_account_posts","params":{"sort":"comments","account":"dotevo","limit":5}}'
# D) notifications
call '{"jsonrpc":"2.0","id":1,"method":"bridge.account_notifications","params":{"account":"dotevo","limit":15}}'
# E) replies under one post (permlink from test 1)
call '{"jsonrpc":"2.0","id":1,"method":"call","params":["condenser_api","get_content_replies",["dotevo","PERMLINK"]]}'
```

### Import from RSS / Atom
In the editor, the **Import** tab loads a feed (your own WordPress or any site), lists its entries and puts the chosen one into the editor (title, Markdown body, tags from categories). A "source" line linking to the original is added at the end (feeds often carry only a summary) and can be switched off. See `docs/SECURITY.md` for how the feed is fetched.
