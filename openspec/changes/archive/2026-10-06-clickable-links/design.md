# Design

## Context

See proposal.md. herdr 0.9 (libghostty-vt) keeps OSC 8 hyperlinks per cell and opens them on
Ctrl-click, including wrapped links; plain `http(s)` URLs are also detected. The renderer is pure and
the column process must not run git; the daemon already asks `LaneRepo` for each lane's repository root
and branch.

## Goals / Non-Goals

**Goals:** every resolvable reference is one Ctrl-click away; the visible text stays short; layout and
`NO_COLOR` output unchanged apart from the invisible link sequences.
**Non-Goals:** a link registry in the database; links in the bar; guessing other repositories.

## Decisions

1. **Resolve at draw time from a per-lane web context, not per item.** A bullet may hold several
   references, so storing one URL per item does not fit. The daemon publishes, with each lane of the tab
   view, `web = {base, forge: 'gitlab'|'github', branch}` (null when unknown). Render-time linking is pure:
   `linkify(text, contexts) → segments[{text, url?}]`.
2. **Which context:** the lanes of the task being drawn; if their web bases differ, only full URLs are
   linked (no guessing).
3. **Patterns** (word-bounded, outside existing URLs): `https?://\S+` (trailing punctuation trimmed);
   `!\d+` → `<base>/-/merge_requests/N` (gitlab); `#\d+` → `<base>/pull/N` (github; on gitlab `#N` is an
   issue → `<base>/-/issues/N`); `\b[0-9a-f]{7,40}\b` containing a digit and a letter → `/-/commit/<sha>`
   (github `/commit/<sha>`); a token equal to the lane's branch or matching `[\w.-]+/[\w./-]+` that has no
   file extension and is in backticks → `/-/tree/<branch>` (github `/tree/`); a backticked token that looks
   like a relative path with an extension → `/-/blob/<branch>/<path>` (github `/blob/`).
4. **Remote → base:** `git -C <root> remote get-url origin` (same timeout/lock rules as `git-lane-repo`,
   cached per root); `git@host:group/repo.git` and `ssh://git@host[:port]/group/repo.git` → `https://host/
   group/repo`; `https://user:token@host/...` loses its credentials (never stored or drawn); `.git` dropped.
5. **Storage:** migration 002 adds nullable `lane.web_base TEXT`, `lane.web_forge TEXT CHECK (web_forge IN
   ('gitlab','github'))`, `lane.web_branch TEXT` via `ALTER TABLE ADD COLUMN` (no rebuild); a fresh
   install and an upgraded v1 database end with the same schema (existing migration test).
6. **Drawing:** OSC 8 `ESC ] 8 ; ; URL ESC \ text ESC ] 8 ; ; ESC \`; `visibleLength` already strips OSC
   via `stripVTControlCharacters`; the grapheme cut and `wrap` treat OSC 8 like CSI (zero width) and
   close an open link at a line end and reopen it on the next line. URLs are drawn only when they contain no
   control characters. `NO_COLOR` keeps links (they are not colour).
7. **Instructions:** links are resolvable names (`!252`, a SHA, `feat/x`, `src/a.ts`) or full URLs copied
   from the transcript, never descriptions.

## Risks / Trade-offs

- [A terminal without OSC 8 support] → it ignores the sequence and shows the name, as today.
- [False positive SHA or path] → patterns need a digit+letter mix (SHA) or backticks (paths, branches);
  a wrong link still shows the original text.
- [Remote URL holds a token] → credentials are stripped before storing; tested.

## Migration Plan

Release as one MR. Migration 002 runs at the next daemon/column start with a backup (`tab-recap.db.v1.bak`).
Rollback: restore the backup and the previous release (the newer-database guard otherwise refuses).
