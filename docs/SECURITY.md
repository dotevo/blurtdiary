# Keys and sessions

- Login with a **posting key** is verified in the browser (the derived public key must be one of the account's posting keys). The key is never
  sent anywhere; only signed transactions / image signatures are.
- By default a session lives in `sessionStorage` (this tab only) **including the key in plain text**; it disappears when the tab is closed.
- **WhaleVault logins are always remembered** on the device (only the account name is stored, no secret), so a reload or a new visit keeps you
  logged in; signing still needs the extension.
- **Remember the key on this device** (opt-in checkbox, discouraged in the UI) also copies the session to `localStorage` (`bd-saved-sessions`),
  so it survives closing the tab. Logging out removes it. Logging out of Blurt removes every session.
- Anything running in the page's origin - including browser extensions with access to the site - can read `sessionStorage` / `localStorage`
  and the key field. This cannot be prevented from page code, and encrypting the key in the page would not help.
- Prefer **WhaleVault**: the key stays in the extension and the page only receives signatures. Use the saved key only on your own device,
  e.g. on a phone where WhaleVault is not available. A posting key cannot transfer funds or change keys, but can post, vote and claim rewards.
- Every WhaleVault action is a separate confirmation (one per account and chain); operations of one chain/account are sent as one transaction.

## Hostile content: blog customisation, posts and comments

All blogs are served from ONE origin, and that origin can hold posting keys (tab storage, or `localStorage` for remembered sessions).
Anyone can publish a blog (`?user=attacker`) or comment under someone else's post, so everything that comes from the chain is untrusted.
A script that ran in any blog could read the keys of every account used in that browser. Layers of defence:

1. **No script can be injected** - `Content-Security-Policy` (meta tag in `index.html`): `script-src 'self'` (no inline scripts, no `javascript:` URLs, no eval),
   `form-action 'none'`, `base-uri 'none'`, `object-src 'none'`, `frame-src 'none'`.
2. **Nothing can be sent out** - `connect-src` lists only the blockchain nodes and image/COAL hosts. Even a script that got through could not post the keys
   anywhere else. `npm run check:csp` fails when a node used in `src/lib/chains/*.ts` is missing there - run it after adding a node.
3. **Allow-list sanitizer** (`renderMd` in `src/lib/util.ts`): posts, comments and the owner's custom panels keep only plain content tags
   and `href/src/alt/title/...`. No `<form>`, `<input>`, `<style>`, `<svg>`, `<iframe>`, no `style`/`class`/`id`/`on*`/`data-*` attributes (a fake "enter your key"
   form or a full-screen overlay built from the app's own CSS classes would be phishing). Links: https/mailto only, `rel="noopener noreferrer nofollow ugc"`.
4. **Config values are validated before use** (`src/lib/config.ts`): colours are `#hex`, fonts/layout/palette are fixed lists, `logo`/`cover` are plain https URLs
   without quotes or brackets, the language must be one of ours; titles and descriptions are rendered as text, never HTML.
5. **Other inputs** - `?user=` must be a valid account name, `?c=` is escaped before it is used in a selector, post thumbnails (`json_metadata.image`)
   must be plain https URLs before they reach CSS `url()`.

Known limits: remote images are loaded from any https host (the host sees the visitor's IP; referrer is stripped), GitHub Pages cannot send
`frame-ancestors`, so clickjacking protection is not possible there, and a browser extension with page access is outside what a web page can defend against.

### Blog extras (pinned post, blogroll, archive, follow)

`pinned` is reduced to a permlink (`[a-z0-9-]`) and only ever used as an RPC parameter; `blogroll` accounts must be valid account names and the description is
rendered as text (a tag in it is shown as characters, not parsed); `?month=` must match `YYYY-MM`. The archive never downloads more than the reader
asks for (one page of 20 posts per click, at most 15 pages when opening a month directly). Follow broadcasts one `custom_json` (`follow`) built from the validated
account names - nothing from the blog's content goes into it.
