# Multi-chain support (Blurt + Hive + Steem)

Blurt Diary is a Blurt blog first. Other chains are *mirrors*: the same posts and comments, published under the
same permlink, so a reader can interact from whichever chain they have an account on.

## Rules

1. **Blurt is always primary.** Every listing, category query, search, notification and reward call goes to Blurt only.
   A post that is not on Blurt does not exist for the blog.
2. **Publishing.** The editor publishes to Blurt (required). If the author is also logged in to another chain *and*
   that chain's account is the one declared in the blog settings, the post is published there too.
3. **One permlink everywhere.** Opening a post asks every configured chain for `get_content(<owner account on that chain>, permlink)`.
4. **Missing vs. unreachable.** A node answering "no such post" (empty author) = *missing* → a **Send to <chain>** button
   appears for the owner. If no node of that chain could be reached = *unknown* (red `!` badge, click to retry); we never offer
   to publish on an unknown state.
5. **Commenting.** A comment goes to every chain where the visitor is logged in **and** the parent exists. A visitor logged in to
   Steem and Melek cannot comment on a post that exists only on Blurt and Hive.
6. **Replies** follow the same rule against the *parent comment's* chains. If your own comment exists on Blurt and you later log in to
   Hive (and the parent exists on Hive), a **Send to Hive** button copies it.
7. **Merging and diffs.** Copies are matched by permlink. Account names may differ per chain (`alice` on Blurt, `alice_h` on Hive);
   the merged comment shows chain badges whose tooltips list each account. When the text differs between chains (edited in only one),
   a **⚠ versions differ** link opens a tab per chain.

8. **Voting and rewards on every chain.** The ♥ button votes on every chain where you are logged in and a copy exists (same weight);
   it un-votes only when you have voted on all of them. Content past its payout window: Blurt keeps the "support comment" flow, other
   chains are skipped with a message. The bar shows the **voting power** of each logged-in chain, the account menu lists each account
   with VP and wallet link, and every chain with pending rewards gets its own 🎁 claim button (token names differ per chain).
9. **Images are uploaded to every chain separately** (each chain's own image host, signed with that chain's posting key), so one host
   dropping a file does not break the other copies. The editor keeps the Blurt URL and a map to the other URLs; each mirrored body
   uses its own chain's URLs. When a post is copied later with "Send to…", images are downloaded and re-uploaded best-effort
   (hosts may block cross-origin reads; then the original URL is kept). Image URLs are ignored when comparing versions.
10. **Where does it exist?** Only when a post is open (never while browsing the list - that would be hundreds of requests): the post header and every
    comment show one marker per chain: solid = exists (tooltip: account), dashed = verified missing, red `!` = could not be checked,
    spinning ring = still checking. Every node call has a 7 s timeout and the whole check a 20 s deadline, so a dead node ends as `!` (click to retry).
11. **Blurt first.** Other chains can be logged in only while logged in to Blurt (greyed out otherwise); logging out of Blurt ends all sessions.
12. **Layout.** A top bar above the logo holds language, login, voting power, rewards, notifications, write/settings and the account menu;
    the category chips are a separate bar below. Dropdowns are fixed to the viewport, scroll inside, and never overflow on phones.
13. **Notifications** are marked with their chain (colour + dot; Blurt only for now). A link to a comment opens the root post in the blog of
    the root post's author (the page switches blogs when needed) and highlights the comment.

## Blog configuration

The owner's accounts on other chains live in the Blurt settings post (`@user/blurt-diary-config`) so every visitor can see them:

```
chains:
- hive | my-hive-account
- steem | my-steem-account
```

Unknown chain ids and invalid account names are ignored. Edit them in ⚙ Settings → *Accounts on other blockchains*.
If a chain is not declared, the blog owner (logged in on Blurt as the blog user) is still offered that chain with whatever account
they are logged in with there, but visitors only see mirrors of declared accounts - save the settings once to publish them.

## Code layout

| File | Role |
| --- | --- |
| `src/lib/chains/types.ts` | `ChainAdapter` interface: everything that differs between chains |
| `src/lib/chains/jsonrpc.ts` | shared JSON-RPC transport with node fail-over |
| `src/lib/chains/thread.ts` | shared found / missing / error resolution and thread building |
| `src/lib/chains/blurt.ts` | Blurt: nodes, `bridge.get_discussion`, BLURT assets, community beneficiary |
| `src/lib/chains/hive.ts` | Hive: nodes, `bridge.get_discussion` (+ `observer`), HIVE/HBD, `percent_hbd`, chain id |
| `src/lib/chains/steem.ts` | Steem: nodes, `condenser_api.get_state`, STEEM/SBD, `percent_steem_dollars`, chain id |
| `src/lib/chains/index.ts` | registry (`CHAINS`), Blurt first |
| `src/lib/mirror.ts` | comment merging, targets, mirroring of posts and comments, publish plan |
| `src/lib/auth.ts` | one session per chain; `auth.me` is the Blurt session |
| `src/lib/wallet.ts` | per-chain voting power, pending rewards, claim |
| `src/lib/actions.ts` | voting on all chains at once |
| `src/lib/upload.ts` | image upload to each chain's host and per-chain body localisation |

### Adding a chain

1. Copy `hive.ts` to `<chain>.ts` and set: nodes, `symbol`, `powerSymbol`, `addressPrefix`, `chainId`, `vaultPrefix`, `imageHost`/`imageHosts`,
   `devAccount`, `postUrl`, `walletUrl`, the reward field names in `rewards()` / `claimOp()`, the `comment_options` asset and
   dollar-percent field names, and the discussion call the chain supports.
2. Register it in `chains/index.ts` (keep Blurt first).
3. Nothing else: login, voting, VP, rewards, image upload, badges, settings and the config parser all read the registry.

## Known limits

- Notifications, the "support old content" comment flow and the blog settings post are Blurt-only.
- The optional 1% app-author tip (`dotevo`) is requested on every chain (same switch); remove `devAccount` from a chain file to disable it there.
- Blurt communities are not mapped; mirrored posts drop `blurt-NNNNNN` tags and use the first remaining tag as category (e.g. `hobby`) as the root `parent_permlink`.
- WhaleVault prefixes for Hive/Steem (`hiv:`, `stm:`) and the public node lists are best-effort; posting-key login is the verified path.
