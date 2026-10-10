# Proposal: tuning defaults move only on a recorded measurement

## Why

Two tuning changes shipped their behaviour with conservative defaults and left the measurements that would move those
defaults for later: `autocompact-coverage-gate` (live check of the ceiling override, replay of blocked checks before any
coverage backoff) and `ledger-pruning` (input sizes, input-only comparison, corpus replay and a live day before pruning is
on by default). The repository rule is that a change is archived only when every task is checked, and that an implemented
change is never left unarchived. The shipped behaviour is complete; what remains is measurement that waits on data. This
change holds that measurement work in one place, so both changes can be archived honestly and no default moves without a
recorded result.

## What changes

- A new capability `tuning-defaults` with one requirement: a tuning default changes only when its named measurement is
  recorded and passes the bar its design states.
- The open measurement tasks of `autocompact-coverage-gate` (8.1, 8.2) and `ledger-pruning` (1.1, 4.1, 4.2, 6.1, 6.2)
  move here, unchanged in substance.
- Later tuning changes that ship behaviour before their measurement add their measurement tasks here.

## Out of scope

Changing any default. Each default moves in its own merge request labelled `changelog::changed`, after its measurement.

## Changelog label

`changelog::internal`
