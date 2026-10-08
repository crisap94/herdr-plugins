# Tasks

Paths are under `tab-recap/`, and every group ends with `bash ci/lint.sh` and `bash ci/test.sh` passing.

## 1. Vocabulary

- [x] 1.1 `CONTEXT.md`: rename **Soft limit** to **Minimum** (default 10; "from this context share a lane is
  evaluated"); add **Sweep** and **Skip (autocompact)**; update **Ceiling** and **In flight** (read past the
  tail). Verify: the `recap-vocabulary` lint passes (`bash ci/lint.sh`).

## 2. The minimum (design decision 7)

- [x] 2.1 `domain/autocompact.ts` and every user: `soft` → `minimum`, `SOFT_*` → `MINIMUM_*`,
  `MINIMUM_DEFAULT = 10`, gate `below-soft` → `below-minimum`. `TAB_RECAP_AUTOCOMPACT_AT` and the 10–95 range
  are unchanged. Verify: `the policy defaults: shadow, minimum 10, …`, `the minimum is 10–95 …`, `the ceiling is above the minimum …` (test/autocompact-config.test.ts).
- [x] 2.2 Settings rows and hints in en and es ("Autocompact from"; "the context share from which an idle
  agent is evaluated"), both READMEs, `config.example.env`. Verify: `the autocompact rows: …` (test/setup-keys.test.ts), `the autocompact…` setup view ('Autocompact from 10%', test/setup-view.test.ts); no "soft limit" left
  (`grep -ri 'soft limit'` outside `openspec/changes/archive` and `experiments/`).

## 3. In flight past the tail (design decision 4)

- [ ] 3.1 The Claude reader re-reads with a doubled budget, up to 16 MB or the whole file, while the tail holds
  an end notice with no launch; `unknown` only when the bound is reached and that is still so. Verify: tests
  for the two spec scenarios built on a generated 3 MB transcript, a file under the budget, and a file over
  16 MB whose open question stays `unknown`.

## 4. Skips (design decisions 5 and 8)

- [ ] 4.1 Migration 011: table `autocompact_skip` (tab, pane, agent, at, gate, share nullable, detail
  nullable; primary key tab and pane; cascade on tab) and `autocompact_skip_readable`. Verify: migration test
  from the oldest fixture through every migration.
- [ ] 4.2 `AutocompactRecords`: `skip`, `cleared` on a decision, `skips()`. `Autocompact` records every gate
  stop (including `no-context`) and nothing when `off`; logs a skip only when the lane's gate changed. Verify:
  tests for each gate, the log-once rule and the clear on decision.
- [ ] 4.3 `tab-recap autocompact`: the "not decided now" block. Verify: listing test with decisions and skips.

## 5. Unchanged and one at a time (design decisions 2 and 3)

- [ ] 5.1 Gate `unchanged`: same tokens and mode as the lane's last decision, made by this daemon process
  (decision time after the process start). Checked after the cooldown, before the in-flight read. Verify:
  tests for same tokens, new tokens, a mode change and a restart.
- [ ] 5.2 `busy` across lanes: an automatic compaction in progress, or an unlinked `on`/`compact` decision
  within five minutes, on any lane. Verify: a test with two lanes over the ceiling in `on`: one request, the
  second lane `busy`, then requested once the first ends.

## 6. Sweeps (design decision 1)

- [ ] 6.1 The daemon sweeps on the first tick after start and every five ticks: the board's idle and done
  lanes, one `consider` at a time; a sweep still running is not stacked. Verify: tests with a fake clock and
  board for the restart scenario and a lane that stays idle.

## 7. The offer (design decision 6)

- [ ] 7.1 `autocompact-questions.ts`: the criteria of `closes_request` and `announces_continuation` as in
  the spec; fixtures `test/fixtures/autocompact/closes_request/offer.json` and
  `announces_continuation/offer.json` (generic text). Verify: the fixtures test reads them.

## 8. Live check

- [ ] 8.1 After merge into the operator's branch and a daemon restart in `on`: a decision or a skip for
  every lane of the board within two minutes (`tab-recap autocompact`); at most one automatic compaction in
  progress at a time; the log holds no repeated skip lines.

## 9. Archive

- [ ] 9.1 `openspec archive autocompact-sweep --yes`, then `openspec validate --specs --strict`, in this
  merge request once every other task is checked.
