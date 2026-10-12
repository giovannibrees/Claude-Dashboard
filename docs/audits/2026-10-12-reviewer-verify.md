# Reviewer verification of the high fixes, 2026-10-12

Checked against branch `selftest` (fixes in 7c22eca, merged in b773d89; later commits only add
docs). Server findings were reproduced against a scratch `HUB_DIR` on a throwaway port. The cloud
page was checked by reading the code and `node --check` on its script; there is no Firestore
runtime here, so the live page behaviour was not run.

**Result: H1 pass, H2 pass, H3 pass. No new critical or high issues.**

## H1 - open items fall off the 400-item window: PASS
`cloud/agent-hub.html:911-944`. Items now come from three subscriptions merged by id
(`mergeItems`): newest 300 (feed), every item with status open/parked/kept (limit 1000), and every
`audit` item (limit 200). Needs you, deliveries, ideas and flags are built from the merged list,
so an old unanswered approval or parked idea stays visible. Tiles count from the same list.
Residual, not blocking: the open-items query caps at 1000 and audits at 200.

## H2 - saved filters hide Needs you: PASS
`cloud/agent-hub.html:618-651`. `needs`, `deliveries`, `flags` and `ideas` use the unfiltered
list; `passes` only feeds the feed. The Needs-you list and the tile use the same condition, so they
cannot disagree. `renderFilters` (lines ~524-528) resets an agent or project filter whose value no
longer exists. "No items match these filters." is used only for the feed.

## H3 - DNS rebinding reaches the API: PASS (reproduced)
`server.js:208-216`. The Host header is checked before any route. From the running server:

| Host header | GET /api/state | POST /api/message (Origin = Host) |
|---|---|---|
| localhost:PORT, 127.0.0.1:PORT | 200 | 200 |
| evil.example, evil.example:PORT | 403 | 403 |
| 127.0.0.1.evil.com:PORT, localhost:PORT.evil.com | 403 | 403 |
| x.y.ts.net.evil.com | 403 | 403 |
| foo.bar.ts.net (allowed Tailscale name) | 200 | 200 |

`/file` also returns 403 for a foreign Host. POST with `text/plain` gives 415, POST with a foreign
Origin gives 403. `/api/connect` refuses the home folder itself, `..` escapes and dot-folders.

## Nearby checks (nothing broken)
- `node --check` passes for `lib/`, `bin/`, `server.js`, `public/app.js` and the cloud page script.
- `/file`: png/pdf/text inline; html and unknown types download with `Content-Security-Policy:
  sandbox`; dot-files 404; `..` paths 404. Static files still serve; `/..%2fserver.js` is 404.
- An upper-case `LOCALHOST:PORT` Origin is refused (browsers send lower case, so harmless).

## Still open (medium/low, not part of this fix round)
- M8: `/file` still serves any absolute path an item names (`/etc/hostname` returned 200). The
  script-execution part is gone; the read-any-file part remains. Restrict to project repos and `HUB_DIR`.
- Low: `connect` fails with ENOENT when `HUB_DIR` has no `templates/agent-snippet.md`, after the
  target folder was already created. Read the template before creating anything.
- No automated tests exist, so none of this has a regression test.
