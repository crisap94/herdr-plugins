# Tasks

Paths under `tab-recap/` unless noted. Every group ends with `bash ci/lint.sh` and `bash ci/test.sh` passing.

## 1. Host policy and launchers

- [x] 1.1 `src/host/policy.mjs` (+ `.d.mts`): `MIN_NODE`, `supportOf`, step ids per platform, English fallback text; `host-check.ts` re-exports the minimum; CONTEXT.md nouns **Host**, **Launcher** — verify: policy tests for each platform and version edge (24.20.0, 24.21.0, v20, garbage)
- [x] 1.2 `src/host/node-host.mjs` and the five launchers; manifest commands, daemon spawn and the column `execve` roll use them — verify: launcher tests in a child Node with a faked host (pane stays, daemon exits 1 with a dated line, command exits 1, `status` goes on); manifest test (every node command is a launcher)
- [x] 1.3 i18n en/es: refusal text and steps per platform (path included) — verify: catalog tests for each platform

## 2. Ports for host differences

- [x] 2.1 `ProcessControl` port; `run.ts` → `process-posix.ts`; `process-windows.ts` (`taskkill /T /F`); selection at composition roots — verify: existing run tests as POSIX adapter tests; Windows adapter tests with a fake spawner
- [x] 2.2 `ConfigPaths` port with `xdg` and `windows` adapters; `daemon/config.ts` uses it — verify: config tests per platform (herdr env still wins)
- [x] 2.3 Rule `host-probes-at-the-edge` + good/bad probes — verify: `ci/lint.sh` shows the probes bite

## 3. From PR #1 (credit toribio99)

- [x] 3.1 `s` opens the settings from the column and the modal; footer hints en/es; README key + optional `prefix+shift+s` binding — verify: present test (hint at every width), key test
- [x] 3.2 `package-lock.json` engines `>=24.21.0`; `daemon-state.test.ts` passes with `LANG=es_ES.UTF-8` — verify: both checks

## 4. Portable gates

- [x] 4.1 `ci/*.sh` without `mapfile` (bash 3.2); GitHub macOS job runs the gates with `/bin/bash`, no `brew install bash` — verify: `bash --version` 3.2 run locally via `docker run --rm -v … bash:3.2` (or equivalent), CI log after merge

## 5. Integration and archive (before merge)

- [x] 5.1 Live check: column, setup and a command started with `npx node@24.13.0` and with `npx node@20` show the refusal with Linux steps; with Node 24.21 everything runs; `s` opens the settings in a real column — verify: excerpts in the MR
- [x] 5.2 GitLab pipeline green on the branch (GitHub runs after merge, green before `release:prepare`) — verify: pipeline link — MR !34 pipeline 16185 green
- [x] 5.3 `openspec archive host-ports --yes`; `grep -c '\- \[ \]' tasks.md` is 0 first; no TBD Purpose; `openspec validate --specs --strict` — verify: specs updated in this MR
