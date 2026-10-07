# Tasks

Paths under `tab-recap/`. Every group ends with `bash ci/lint.sh` and `bash ci/test.sh` passing.

## 1. Send

- [ ] 1.1 Split send for Claude (`/compact ` typed, then the guidance, then Enter; Enter only if both sends succeed) — verify: herdr-agents test asserts the three calls in order; flow test

## 2. History and document

- [ ] 2.1 History query (design decision 2) on the recap-records repository — verify: repository test over runs in two chapters, dedup, first/last/seen, task filter, 300 cap order
- [ ] 2.2 `schema/compaction-input.dtd` and its renderer (design decision 3) — verify: fixtures validated with `xmllint --dtdvalid` (with/without note, long history, hostile text) and broken ones that fail

## 3. Brief

- [ ] 3.1 One harness port (`Harness.run({instructions, input}, {model, effort})`): the five recap-writer adapters become harness adapters, the recap writer and the brief are two jobs on it (design decision 4) — verify: existing summarizer goldens still pass as harness goldens; the brief job's args per harness with overridden model/effort; `default` effort passes nothing; `off`/missing CLI → template; timeout and failure paths
- [ ] 3.2 Validation and fallback (design decision 5), cap 3 000 for brief and template — verify: forbidden words, over-length cut at a sentence end, fallback used and logged
- [ ] 3.3 Flow uses the brief for Claude and for the Codex/opencode restore message; notification while writing — verify: compaction flow tests with a fake brief writer
- [ ] 3.4 Jobs in settings (design decision 7): `Job` value + one config reader; `TAB_RECAP_COMPACT_BY/_MODEL/_EFFORT` (recap / '' / high); the settings modal's **Models** group, one row per job showing and editing harness · model · effort, en/es; README table of jobs — verify: config tests (defaults, `recap` inheritance, overrides, invalid values), setup-keys tests, render golden

## 4. Integration and archive (before merge)

- [ ] 4.1 Live check in a throwaway tab: a Claude agent with a long history compacted through the real flow (split send; brief job set once to `claude · sonnet · medium` and once to `codex · gpt-6-luna · high`), and a Codex agent — its transcript shows `/compact` with the brief as arguments and a compaction; a Codex agent gets the restore message — verify: excerpt in the MR
- [ ] 4.2 GitLab pipeline green on the branch (GitHub runs after merge, green before `release:prepare`) — verify: pipeline link
- [ ] 4.3 `openspec archive compaction-brief --yes`, no TBD Purpose, `openspec validate --specs --strict` — verify: specs updated in this MR
