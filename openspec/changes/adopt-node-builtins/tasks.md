# Tasks

All paths are under `tab-recap/`. Cut the branch from `main` after tab-recap 1.6.0 (SQLite state) has
landed. Every group ends with `bash ci/lint.sh` and `bash ci/test.sh` passing.

## 1. Text width and wrapping

- [x] 1.0 Narrow `rules/recap-layers-no-io.yml` to exempt exactly `node:util` (design decision 0): add a good probe importing `styleText` from `node:util`, keep the bad probes biting, update the rule's message/note and the red-line row in `CLAUDE.md` — verify: `bash ci/lint.sh` clean, and its probe check shows the bad probes still fail
- [x] 1.1 Add the noun **Cell width** to `CONTEXT.md` (escapes 0, emoji presentation 2, combining marks 0, else 1; CJK out of scope) — verify: lint's vocabulary check passes
- [x] 1.2 Reimplement `visibleLength` in `src/recap/render/wrap.ts` with `util.stripVTControlCharacters` + `Intl.Segmenter` (grapheme) + emoji-presentation rule — verify: new tests for `recap` in colour = 5, `📝✅` = 4, `👩‍💻` + `é` = 3
- [x] 1.3 Make the long-word cut in `wrap()` walk graphemes by cell width instead of `slice` — verify: tests for `xxxxxxx📝📝📝` at width 8 (every line ≤ 8 cells, whole characters only, rejoins to the original) and twenty `é` (no line starts with a combining mark)
- [x] 1.4 Update golden render tests whose emoji lines change width, each change explained in the test name — verify: `bash ci/test.sh` green

## 2. Escape stripping

- [x] 2.1 Replace the `STYLE` regex in `src/setup/main.ts` with `util.stripVTControlCharacters` — verify: setup view tests unchanged and green
- [x] 2.2 Replace the hand-written SGR parsing in `src/adapters/glow.ts` `trimPadding` where it only strips, keeping the trailing-colour re-attach behaviour — verify: existing glow tests green plus one case with a non-SGR escape

## 3. Colours

- [x] 3.1 Build the style table in `src/recap/render/wrap.ts` with `util.styleText(format, text, { validateStream: false })`, plus an identity table with the same keys — verify: golden outputs byte-identical with the coloured table
- [x] 3.2 Choose the table once at each composition root (`src/column/main.ts`, `src/setup/main.ts`) from `process.stdout.hasColors()` and pass it into rendering — verify: test that `NO_COLOR=1` (and `FORCE_COLOR=0`) yields output with no escape sequences and the same visible text
- [x] 3.3 Document `NO_COLOR` support in `README.md` (one line) — verify: README lint/links pass

## 4. herdr socket framing

- [x] 4.1 Replace `onLines` in `src/transport/herdr.ts` with `readline.createInterface({ input: socket, crlfDelay: Infinity })`, ignoring non-object lines as today — verify: tests feeding a message split across two chunks, two messages in one chunk, a multi-byte character split across chunks, and a malformed line (ignored)

## 5. Command-line entry

- [x] 5.1 Parse `bin/tab-recap.ts` arguments with `util.parseArgs` (`strict`, `allowPositionals`, `--help`/`-h`), positionals unchanged — verify: tests: `backend codex gpt-5-mini` unchanged; unknown command → usage on stderr, exit 2; `--help` → usage on stdout listing every command, exit 0, no side effects; `start --forse` → names the option, exit 2, daemon not started
- [x] 5.2 Update the README command list if the usage text changed — verify: README matches `--help` output

## 6. Small swaps

- [x] 6.1 Use `setTimeout` from `node:timers/promises` for the re-list delay in `src/adapters/opencode-summarizer.ts` — verify: existing opencode summarizer test green
- [x] 6.2 Implement `ago` in `src/i18n/en.ts` and `src/i18n/es.ts` with `Intl.RelativeTimeFormat(locale, { style: 'narrow', numeric: 'always' })`, formatting negative amounts and `-0` for zero; `elapsed()` keeps choosing the unit and clamps future times to 0 — verify: tests for en `12s ago · 5m ago · 3h ago · 2d ago · 0s ago`, es `hace 12 s · hace 5 min · hace 3 h · hace 2 d · hace 0 s`, and a future time → `0s ago`

## 7. Integration (before merge)

- [ ] 7.1 GitLab pipeline green on the branch (GitHub Actions — ubuntu, macOS, Node 24.14.0 — run on `main` after merge and must be green before `release:prepare`) — verify: pipeline link in the merge request
- [x] 7.2 Live check before merge, running a column from the branch's worktree: a recap containing emoji keeps every line inside the column, and a column started with `NO_COLOR=1` has no colours — verify: `herdr pane read` excerpt in the merge request — done 2026-10-06: the branch's column in a 32-cell pty with an emoji-heavy recap: 0 lines wider than the column (the code before: 3), and with `NO_COLOR=1` 0 colour escapes (with colour: 118)

## 8. Archive

- [ ] 8.1 With every task above checked and the gates green, run `openspec archive adopt-node-builtins --yes`, replace any placeholder `## Purpose` it writes, and commit it in this same merge request — verify: `openspec/changes/archive/<date>-adopt-node-builtins/` exists, `openspec/specs/tab-recap/{text-layout,relative-time,cli}/spec.md` exist, `openspec validate --specs --strict` passes and `openspec list` shows no active change
