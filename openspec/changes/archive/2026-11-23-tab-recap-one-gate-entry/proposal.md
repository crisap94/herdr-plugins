# Proposal: tab-recap's gates run through one entry

## Why

tab-recap ran its gates through `ci/lint.sh` and `ci/test.sh`, while the five other units run theirs through
`gates/run.sh`. Two entries for one job meant every document, template and CI job had to know which unit used which. Plan
step C5 makes tab-recap use the same entry as the other units.

## What changes

- `tab-recap/ci/lint.sh` and `tab-recap/ci/test.sh` are deleted. `bash gates/run.sh lint` and `bash gates/run.sh test`
  run the same steps with the same verdicts.
- The requirements of `code-comments`, `code-gates` and `engine-boundary` that name the old scripts now name the new entry.
  No requirement changes what it checks.

## Out of scope

- What any gate checks: every rule, probe and test keeps its verdict.
- The `.gitlab-ci.yml` domain-baseline job, whose rule still points at the retired `ci/domain-types-baseline/`; plan step C6
  cleans it up.
- The other five units' gate settings: they keep scanning their `source` folders.

## Changelog label

`changelog::internal`

## Impact

- Affected specs: `tab-recap/code-comments`, `tab-recap/code-gates`, `tab-recap/engine-boundary`.
- Users see nothing: the gates check what they checked before.
