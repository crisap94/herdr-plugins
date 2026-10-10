# Tasks

Every group ends with `bash ci/lint.sh` and `bash ci/test.sh` passing, run from `tab-recap/`.

## 1. Vocabulary

- [x] Add to `tab-recap/CONTEXT.md`: Autocompact style, Re-check.

## 2. The style table and its keys (design decisions 1 and 4)

- [x] `src/recap/domain/autocompact-style.ts`: the three styles' numbers, the style reader (`balanced` unless
      known), and the four advanced keys with their ranges.
- [x] `policyOf` resolves the style into the policy: verdict thresholds, coverage pass mark, ceiling, cooldown,
      re-check interval.
- [x] Tests: each style's numbers; an explicit key wins over the style; an invalid key falls back to the style's
      number; `balanced` equals the existing constants.

## 3. Verdict and brief check read the thresholds (design decision 2)

- [x] `verdictOf` takes the thresholds (default the balanced constant); `asking()` passes the policy's.
- [x] `covered` and `missingOf` take the pass mark; the compaction wiring reads it at call time.
- [x] Tests: the same answers give `compact` under eager and `wait` under gentle; a brief at 0.65 passes eager and
      fails balanced; the default keeps every existing verdict and coverage test green.

## 4. Ceiling, cooldown and re-check (design decision 3)

- [x] The ceiling and the cooldown default to the style's numbers when their keys are unset.
- [x] `gated()` lets an `unchanged` lane through when the re-check interval has passed since its last decision,
      and the stop carries the re-check; `run()` logs `unchanged → recheck`.
- [x] Tests: eager asks an idle `wait` lane again after 30 minutes and not before; gentle and balanced never do;
      busy, below-minimum, cooldown and in-flight still stop a re-checked lane.

## 5. Where it shows (design decisions 5 and 6)

- [x] The settings modal row «Autocompact style» (English and Spanish), its hint, its lock key, and the write of
      `TAB_RECAP_AUTOCOMPACT_STYLE`; a locked row is never written.
- [x] `config.example.env`: the style and the four advanced keys, commented with their defaults.
- [x] README: a table of the three styles and their numbers, and the advanced keys.
- [x] `tab-recap autocompact` prints the active style and its numbers in its header; a test pins the header.
- [x] Screenshots `docs/screens/setup-en.png` and `setup-es.png` regenerated as before.

## 6. Archive

- [x] Run `openspec archive autocompact-style` once every other task is checked and the gates pass, in this merge
      request.
