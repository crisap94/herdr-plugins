# Tasks

Recorded after implementation (the change predates OpenSpec in this repository); every box was
verified by the reviewer before archiving. Paths under `tab-recap/`.

## 1. Store

- [x] 1.1 Ports per aggregate (`src/ports/{recap-records,tab-views,column-visibility,requests}.ts`) and repositories under `src/adapters/db/` (every file ≤ 150 lines) — verify: `bash ci/lint.sh` clean
- [x] 1.2 Schema `001-initial` (live, history, derived and readable views), FK indexes, CHECKs — verify: `test/db/schema.test.ts`
- [x] 1.3 UUIDv7 + TypeID — verify: `test/db/uuid7.test.ts`, `test/db/typeid.test.ts`
- [x] 1.4 `writeTx` with `BEGIN IMMEDIATE` and the lint rule against bare `BEGIN` — verify: rule probes in `ci/lint.sh`
- [x] 1.5 Daemon, column, setup and CLI wired to the store; WAL checkpoint and close in the daemon — verify: `bash ci/test.sh` 321/321

## 2. Migrations

- [x] 2.1 Runner, backups (`VACUUM INTO`, keep 3), newer-db guard, rebuild helper — verify: `test/db/migrate.test.ts`
- [x] 2.2 `ci/check-migrations.sh` wired into lint with bite cases — verify: `ci/guard-bite.sh`
- [x] 2.3 Node floor 24.14.0 (`engines`, host check, GitHub job `floor`) — verify: CI job on 24.14.0

## 3. Import

- [x] 3.1 Legacy reader, one-transaction import, read-back comparison, move to `legacy-files-*` — verify: `test/db/import/*.test.ts`
- [x] 3.2 Dry run — verify: run against a copy of a live state directory: 63 recaps, 76 views, no differences

## 4. Integration (before merge)

- [ ] 4.1 GitLab pipeline green on the branch (GitHub Actions — ubuntu, macOS, Node 24.14.0 — run on `main` after merge and must be green before `release:prepare`) — verify: MR !20 pipeline
- [x] 4.2 Docs: CONTEXT.md nouns, README (state, dry run, rollback, local disk), CONTRIBUTING (changing the schema) — verify: review

## 5. Archive

- [ ] 5.1 `openspec archive keep-state-in-sqlite --yes` in this merge request — verify: `openspec validate --specs --strict` passes and `openspec/specs/tab-recap/{state-store,state-migrations,legacy-import}/spec.md` exist
