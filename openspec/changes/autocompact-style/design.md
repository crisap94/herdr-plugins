# Design

## 1. One table, resolved once

`src/recap/domain/autocompact-style.ts` holds the three styles as a literal table: for each style the verdict
thresholds, the brief check's pass mark, the ceiling, the cooldown and the re-check interval (`null` = never).
`balanced` takes its verdict thresholds from the existing `THRESHOLDS` constant, so the default cannot drift from
what the decider's tests already pin.

`policyOf` resolves the style into numbers. The policy handed to the daemon carries the numbers, not the name:
the verdict, the brief check, the gates and the listing all read numbers, so none of them needs to know a style
exists. Resolution order for each number: an explicit key that parses and is in range; else the style's number.
An out-of-range or non-numeric value is the style's number, never an error, as with `_AT` and `_CEILING` today.

Why not a free-form table of numbers: the operator asked for a style to configure, and three named presets with
an advanced escape hatch keep the common choice to one line. The four advanced keys are exactly the levers the
brief named; the undecided band is deliberately not a key, because it is tied to the style's safe and close
numbers and a free band could contradict them.

## 2. Thresholds reach the verdict and the brief check as parameters

`verdictOf(answers, thresholds = THRESHOLDS)` takes the thresholds. Its default keeps the experiment tools and any
other caller on the balanced numbers without a change. `asking()` in the autocompact service passes the policy's
thresholds, read at the start of the consideration, as `run()` already reads the policy once.

`covered(brief, facts, decider, keptAtLeast = KEPT_AT_LEAST)` and `missingOf` take the pass mark the same way. The
compaction wiring reads `loadConfig().autocompact.coverageAtLeast` at call time, the same as the other compaction
settings, so a change applies without a restart.

## 3. Re-check is a relaxation of `unchanged`, not a new gate

The gate order does not change. `gated()` computes `unchangedOf(...)` as today. When the policy has a re-check
interval and the last decision is at least that old, the lane is not `unchanged` any more; the stop carries
`recheck: true` so `run()` logs `unchanged → recheck` when the consideration goes on to ask or to compact.

Idle time is measured from the last decision (`lastDecisionAt`), not from the last token change: the operator's
words are "idle that long since its last decision", and a lane whose tokens keep changing is not `unchanged` in
the first place. Only a last decision of `wait` or `undecided` is re-checked: a `compact` decision is never asked
again, in `shadow` either, because the answer would only repeat a request nobody made. The re-check never bypasses
`busy`, `below-minimum`, `cooldown` or `in-flight`. Each re-check is one decider call, and the README says so.

`gateOf`'s signature and its returned shape do not change, so the existing gate tests and the experiment's gate
call stay as they are.

## 4. Advanced keys are validated by range

| Key | Range | Style fallback |
| --- | --- | --- |
| `TAB_RECAP_AUTOCOMPACT_SAFE_AT_MOST` | 0.05 – 0.50 | the style's safe number |
| `TAB_RECAP_AUTOCOMPACT_CLOSES_AT_LEAST` | 0.50 – 0.95 | the style's close number |
| `TAB_RECAP_AUTOCOMPACT_COVERAGE_AT_LEAST` | 0.30 – 0.95 | the style's pass mark |
| `TAB_RECAP_AUTOCOMPACT_RECHECK_IDLE_MS` | 60 000 – 86 400 000 | the style's re-check (never, or 30 min for eager) |

The verdict keys are also checked against the undecided band of the style: `safe` must be below the band's start
and `closes` above its end. Without that, `safe` 0.50 with `closes` 0.50 under `balanced` makes every answer of 0.50
`compact` even though it lies inside the band. A key that breaks the rule falls back to the style's number, as an
out-of-range one does.

The fractions parse with `Number`, with the same empty-string guard the existing `word` helper gives. No
hand-written parser is kept: a number in a range is one comparison, and no Node built-in does range validation
for config values.

## 5. The settings row

`autocompactStyle` is a new `FieldId`/`RowId`, a choice over `gentle · balanced · eager`, placed right after
«Autocompact from». Its lock key is `TAB_RECAP_AUTOCOMPACT_STYLE`, and `changes()` writes it like the other
autocompact entries. The hint names what changes; the English and Spanish strings live in `src/i18n/`.

## 6. Where the numbers show

`tab-recap autocompact` prints one header line before the table: the style and its numbers as they are in force
now, read from the same policy the daemon reads. The listing function takes the header as a parameter so the
pure function stays pure.

## Alternatives considered

- **Mirror the numbers in the modal as editable numbers.** Rejected: the modal would need a number editor per
  threshold, and the operator asked for a style.
- **A re-check that ignores `unchanged` entirely.** Rejected: `balanced` and `gentle` keep the `unchanged` gate
  because a `wait` at the same tokens and mode is not news to them; only the chosen style relaxes it.
