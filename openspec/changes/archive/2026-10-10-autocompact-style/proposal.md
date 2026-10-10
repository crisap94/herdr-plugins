# Proposal

## Why

Autocompact's aggressiveness is fixed in code. The verdict thresholds (safe at most 0.30, closes at least 0.70,
undecided between 0.35 and 0.65), the brief check's pass mark (0.70), the default ceiling (80 %) and cooldown
(ten minutes) are the same for every operator. An operator who wants compactions sooner, or who wants a quieter
tool that waits for a clearly finished moment, has no lever short of editing code. And a lane judged `wait` is
never asked again until its tokens change, so an idle lane can sit at 78 % for hours without a new look.

## What Changes

- **One setting for the style.** `TAB_RECAP_AUTOCOMPACT_STYLE` is `gentle`, `balanced` (the default, exactly
  today's numbers) or `eager`. It sets, together: the verdict's warning and close thresholds, the undecided band,
  the brief check's pass mark, the ceiling and the cooldown when their own keys are unset, and whether an idle
  `wait` lane is asked again after it stays idle.
- **Explicit keys win.** `TAB_RECAP_AUTOCOMPACT_CEILING` and `TAB_RECAP_AUTOCOMPACT_COOLDOWN_MS` keep their
  meaning and override the style. Four advanced keys override the style's verdict and check numbers and its
  re-check: `TAB_RECAP_AUTOCOMPACT_SAFE_AT_MOST`, `…_CLOSES_AT_LEAST`, `…_COVERAGE_AT_LEAST` and
  `…_RECHECK_IDLE_MS`. Each is range-checked; an invalid value falls back to the style's number.
- **Re-check of idle `wait` lanes.** When the re-check is set (by `eager`, or by `…_RECHECK_IDLE_MS`), the
  `unchanged` gate lets a lane through again once it has been idle that long since its last decision. The daemon
  logs the reason as `unchanged → recheck`.
- **Visible in three places.** The settings modal gets an «Autocompact style» row (English and Spanish, with a
  hint that names what changes); `config.example.env` and the README document the three styles; and
  `tab-recap autocompact` prints the active style and its numbers in its header.

## Out of scope

- Changing the default style or any number of `balanced`: a plugin upgrade decides exactly as it did before.
- The undecided band, the decider's questions and their criteria, the decider itself and its models.
- Per-agent or per-tab styles: one style applies to every lane.
- The brief check's decider (`TAB_RECAP_AUTOCOMPACT_COVERAGE_BY`) and the coverage rewrite.
- The experiment tools under `experiments/` and their fixtures: they keep the balanced numbers.

## Impact

- Code: `src/recap/domain/autocompact*.ts`, `src/recap/application/` (the verdict, the brief check, the gates,
  the settings modal), `src/daemon/` (wiring of the brief check), `src/recap/render/setup.ts`, `src/i18n/`.
- Docs: `config.example.env`, `README.md`, `CONTEXT.md`, and the regenerated screenshots `setup-en.png` and
  `setup-es.png`.
- Behaviour with the default setting: none. Every existing test keeps its expectations.

## Changelog

The merge request carries the label `changelog::added`.
