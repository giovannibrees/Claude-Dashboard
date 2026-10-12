# Security fix verification (2026-10-12)

Verifier: security-hub-selftest (role: security). Branch: selftest, HEAD b773d89. No product code changed.
Method: ran `server.js` from a scratch copy (port 4799, `HUB_PROJECTS_ROOT` = scratch folder) and replayed the attacks from `2026-10-12-security.md` with curl.

## Result

| finding | verdict |
|---|---|
| H1 `/file` active content and file read | PASS for the XSS; one medium residual (symlink bypass, see R1) |
| H2 DNS rebinding / Host check | PASS |
| H3 `/api/connect` arbitrary folder and shell injection | PASS; one low residual (symlink escape, see R2) |

No high findings remain open. No regressions found nearby.

## H1: PASS
- `x.html`, `x.svg`, `x.js` listed as attachments: served as `application/octet-stream` with `Content-Disposition: attachment`, `nosniff` and `Content-Security-Policy: sandbox; default-src none`. They no longer run in the dashboard origin.
- png/jpg/gif/webp/pdf and txt/md/json/csv are served inline (txt types as `text/plain`); the 5 attachment kinds an agent normally posts still render. `ok.txt` returned 200.
- Unlisted path (`/etc/hostname`): 404. Direct dot-folder path (`.ssh/id_rsa`): 404. `..` in path: 404.
- Not fixed from the audit's suggestion: attachments are still not restricted to the repo or a hub folder. An item that lists `/etc/passwd` gets it back (as a download, not executable). See R1.

## H2: PASS
- `Host: evil.example:4799` gets 403 on GET `/api/state`, POST `/api/connect` and GET `/file`. `Host: localhost:4799` and `127.0.0.1:4799` get 200.
- `Host: evil.ts.net:4799` gets 403 (the `*.ts.net` pattern needs three labels); `Host: localhost:4799.evil.com` gets 403.
- Cross-origin POST with a good Host: 403. POST with `Content-Type: text/plain`: 415.
- A POST with no `Origin` header (curl, local process) still passes the origin test, as before; the Host check now covers the rebinding case, and the audit only asked for Host plus Content-Type.

## H3: PASS
- Folder outside `HUB_PROJECTS_ROOT` (`/home/user`, `/etc/x`, `..` traversal, sibling `home2`, `~`, the root itself, the hub dir): all 400.
- Hidden folder (`.hid`): 400. Quotes, `$`, backtick, backslash, newline in folder: 400.
- Single quote in folder is accepted but the start command is single-quoted with `'\''` escaping. Executed it in bash: it changed into the odd-named directory and the injected `touch` did not run.
- Normal connect inside the root still works (`.hub.json`, `.claude`, `CLAUDE.md`, `BRIEF.md`, `.git` created).

## Residual findings (new, none high)

### R1. Symlink bypasses the `/file` dot-folder guard (medium)
- Where: `server.js:198-202` (`allowedFile`) and `:242`. The path is never resolved with `realpath`.
- Reproduced: `att/link.txt` (symlink to `home/.ssh/id_rsa`) listed as an attachment returned the file content (`SECRET`) as `text/plain`. Any non-dot path to a readable file also works, for example `/etc/passwd`.
- Needs an agent that can post items and create a symlink; read-only disclosure, no code execution. Fix: `fs.realpathSync` before the dot-segment test, and restrict to the project repo or a hub attachments folder.

### R2. Symlink inside the projects root escapes the folder check (low)
- Where: `server.js:139-141`. Check is on the lexical path only.
- Reproduced: `home/linkdir` -> `outside/`; connecting `home/linkdir/evil` created the folder in `outside/`. Needs a pre-existing symlink under the root, which the CEO's own account would have to create. Fix: `realpath` the nearest existing parent before the prefix test.

### R3. Not in scope of the high fixes (unchanged)
- M1 to M4 and L1 to L5 were not part of this verification and were not retested. L1 (`server.js:251`) is fixed on this branch (`PUBLIC + path.sep`).
