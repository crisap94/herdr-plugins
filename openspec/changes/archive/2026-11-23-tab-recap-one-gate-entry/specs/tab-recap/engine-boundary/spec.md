## MODIFIED Requirements

### Requirement: An engine file imports only engine files

`tab-recap/ci/engine-files.json` SHALL list the engine's files: the import closure of
`tab-recap/src/recap/application/recap-job.ts` and the facade `src/recap/application/engine.ts`. The lint gate SHALL fail, through
the module-graph rule `engine-self-contained`, when a listed file imports a file that is not listed, other than `node:util`. A
test SHALL fail when the manifest differs from the computed closure.

#### Scenario: An engine file imports a host file

- **WHEN** a file listed in `ci/engine-files.json` imports a file under `src/daemon/`
- **THEN** `bash gates/run.sh lint` SHALL fail with the rule `engine-self-contained` and both paths named

#### Scenario: The manifest drifts from the closure

- **WHEN** a file is added to the closure of `recap-job.ts` and not to `ci/engine-files.json`
- **THEN** `bash gates/run.sh test` SHALL fail and name the missing file

#### Scenario: An engine file imports another engine file

- **WHEN** a listed file imports another listed file or `node:util`
- **THEN** the rule `engine-self-contained` SHALL NOT report it

### Requirement: The writer's input is byte-identical before and after

Cutting the boundary SHALL NOT change what the writer reads or what the store holds. Prompts, the DTD, SQL columns and stored
values SHALL keep their names; the engine's nouns (scope, followed session) SHALL exist only at the facade. A golden test SHALL
replay `test/fixtures/replay-claude.jsonl` with a fake summarizer and the scratch store and compare the writer's input bytes and
the resulting facts with a committed snapshot.

#### Scenario: A step of the cut changes the writer's input

- **WHEN** a change made under this capability alters one byte of the writer's input for the replayed fixture
- **THEN** the golden test SHALL fail and `bash gates/run.sh test` SHALL fail

#### Scenario: Replay through the facade

- **WHEN** replay is re-pointed to build its job through `createEngine`
- **THEN** the golden test, which drives `replay` in `src/recap/application/replay.ts`, SHALL pass with its committed snapshot
  unchanged

