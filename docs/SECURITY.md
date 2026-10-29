# Keys and sessions

- Login with a **posting key** is verified in the browser (the derived public key must be one of the account's posting keys). The key is never
  sent anywhere; only signed transactions / image signatures are.
- By default a session lives in `sessionStorage` (this tab only) **including the key in plain text**; it disappears when the tab is closed.
- **Stay logged in on this device** (opt-in checkbox, discouraged in the UI) also copies the session to `localStorage` (`bd-saved-sessions`),
  so it survives closing the tab. Logging out removes it. Logging out of Blurt removes every session.
- Anything running in the page's origin - including browser extensions with access to the site - can read `sessionStorage` / `localStorage`
  and the key field. This cannot be prevented from page code, and encrypting the key in the page would not help.
- Prefer **WhaleVault**: the key stays in the extension and the page only receives signatures. Use the saved key only on your own device,
  e.g. on a phone where WhaleVault is not available. A posting key cannot transfer funds or change keys, but can post, vote and claim rewards.
- Every WhaleVault action is a separate confirmation (one per account and chain); operations of one chain/account are sent as one transaction.
