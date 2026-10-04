# Contributing

Thanks for helping. Issues and pull requests are welcome.

## Layout

One plugin per directory, each self-contained (`herdr-plugin.toml` at its root). Today that is
[`tab-recap/`](tab-recap). Plugin-specific rules live in the plugin's own docs, not here.

## Setup

```bash
cd tab-recap
npm install          # dev tools only (tsgo, oxlint, ast-grep); the plugin has zero runtime dependencies
herdr plugin link .  # run your checkout inside herdr
```

Needs Node ≥ 24 and herdr ≥ 0.9.0.

## Gates

Run both from the plugin directory before you send anything:

```bash
bash ci/lint.sh      # ast-grep rules and their probes, vocabulary ↔ CONTEXT.md, tsgo typecheck, oxlint
bash ci/test.sh      # node --test
```

`lint.sh` checks that every architecture rule passes on the tree **and** fires on its bad probe
(a rule that cannot fail is not a rule), that identifiers use the vocabulary, that the code
typechecks, and that a seeded violation is rejected. Exit codes: `0` clean, `1` a finding, `3`
could not look (a tool is missing — run `npm install`).

## House rules

- **TypeScript on Node ≥ 24, run directly.** No build step, no runtime dependencies.
- **Layered, with red lines.** A pure domain fold, sum-typed ports, one adapter per port; ast-grep
  rules enforce the boundaries and each ships a bad/good probe it must bite. A new rule needs both
  probes. See [`tab-recap/CLAUDE.md`](tab-recap/CLAUDE.md).
- **Use the vocabulary.** A word means one thing; banned synonyms fail lint. See
  [`tab-recap/CONTEXT.md`](tab-recap/CONTEXT.md), and add new terms there first.
- **Tests with the change.** Domain decisions are tested as plain folds, without fakes or timers.

## Commits

Imperative mood, scoped to the plugin: `tab-recap: reopen the column after a resync`. One logical
change per commit.

## Pull requests and the mirror

The upstream repository is the source of truth; this GitHub repository is a **push mirror of
`main`**, so anything pushed directly here is overwritten. Issues are welcome here. Pull requests
are welcome too, but the maintainer applies them upstream and they arrive back through the mirror;
your PR is then closed with a link to the commit (your authorship is kept).

## Bug reports

Please include:

- `herdr --version`
- the plugin's `status` output (`herdr plugin action invoke tab-recap.status`, or
  `node bin/tab-recap.ts status` in `tab-recap/`)
- the relevant lines of the daemon log, at the path `status` prints
- the harness you use and what you expected to happen

## Adding a plugin

1. Create `<plugin>/` at the repo root with a `herdr-plugin.toml` (`id`, `name`, `version`,
   `min_herdr_version`, `description`, `platforms`).
2. Give it a `README.md`, a `CONTEXT.md` (its vocabulary, enforced by a lint rule), a `CLAUDE.md`
   (layers and red lines) and its own `ci/lint.sh` and `ci/test.sh`.
3. Follow the house rules above, add a `## <plugin>` section to [`CHANGELOG.md`](CHANGELOG.md),
   and add a row to the table in the root [`README.md`](README.md).
4. Wire its gates into the CI configuration.

By contributing you agree your work is licensed under the [MIT License](LICENSE).
