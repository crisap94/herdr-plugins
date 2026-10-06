# Tasks

Paths under `tab-recap/`. Every group ends with `bash ci/lint.sh` and `bash ci/test.sh` passing.

## 1. Web context per lane

- [x] 1.1 CONTEXT.md noun **Web context**; `LaneRepo` returns the `origin` web base and forge (remote → https, `.git` dropped, credentials stripped, cached per root) — verify: adapter tests for ssh, ssh://port, https+token, github.com vs other hosts, no remote
- [x] 1.2 Migration `schema/002-lane-web.ts` (`ALTER TABLE lane ADD COLUMN web_base/web_forge/web_branch`), registered in `schema/index.ts` — verify: migrate tests (fresh == upgraded from the v1 fixture, data kept), `ci/check-migrations.sh` green
- [x] 1.3 `TabLane.web` written by the daemon (`viewOf` + `TabViews`) and read back — verify: tab-views round trip, a lane without a repo has `web: null`

## 2. Linking and drawing

- [x] 2.1 Pure `src/recap/render/links.ts`: `linkify(text, contexts)` per design decision 3, one context per task (none when bases differ) — verify: table tests for every pattern, punctuation trimming, no link inside an existing URL, two-repository case
- [x] 2.2 OSC 8 in `wrap.ts`/`present.ts`: zero width, cut/wrap close and reopen a link per line, control characters refused in URLs; NO_COLOR keeps links — verify: golden column/modal output with links, narrow-column wrap test, width test
- [x] 2.3 Writer instructions: links are resolvable names or full URLs from the transcript — verify: instructions golden re-reviewed

## 3. Integration and archive (before merge)

- [x] 3.1 Live check from the branch: a column for a tab with `!N`, a SHA, a branch and a file shows OSC 8 links (raw pty capture) that resolve to the right GitLab pages — verify: excerpt in the MR — done: branch column in a 60-cell pty on a copy of the live db (migrated to v2, v1 backup made) drew OSC 8 links for !25, ca9a099, a file path, the branch and a GitHub URL; the GitLab API confirms MR 25, commit ca9a099 and branch atalaya exist
- [x] 3.2 GitLab pipeline green on the branch (GitHub runs after merge, green before `release:prepare`) — verify: pipeline link — MR !28 pipeline 16094 green
- [x] 3.3 `openspec archive clickable-links --yes`, no TBD Purpose, `openspec validate --specs --strict` — verify: specs updated in this MR
