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

Needs Node ≥ 24.21.0 and herdr ≥ 0.9.0.

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

Both also run on GitHub Actions (Linux and macOS) for every push and pull request to `main`, and in
the upstream CI.

## Changelog and versions

You do not edit `CHANGELOG.md` or any version. Every change reaches `main` through a merge request
with **one label** saying what it is, and the MR title becomes the changelog line:

| label | meaning | release |
| --- | --- | --- |
| `changelog::added` | a new capability | minor |
| `changelog::changed` | a change in behaviour | patch |
| `changelog::fixed` | a bug fix | patch |
| `changelog::internal` | tests, refactors, CI, docs: not for the notes | none by itself |
| `changelog::breaking` | in addition to one of the above, when users must act | major |

Fill in the template's two sections ("What changes for the user", "Why"). A CI job fails the merge
request without a label or with an empty section. Labels are read when the pipeline starts, so set
them first; if you add one afterwards, run the pipeline again. Write the title as the line you
would like to read in the notes ("Hide or show a tab's column with a key").

## House rules

- **TypeScript on Node ≥ 24.21.0, run directly.** No build step, no runtime dependencies.
- **Layered, with red lines.** A pure domain fold, sum-typed ports, one adapter per port; ast-grep
  rules enforce the boundaries and each ships a bad/good probe it must bite. A new rule needs both
  probes. See [`tab-recap/CLAUDE.md`](tab-recap/CLAUDE.md).
- **Use the vocabulary.** A word means one thing; banned synonyms fail lint. See
  [`tab-recap/CONTEXT.md`](tab-recap/CONTEXT.md), and add new terms there first.
- **Tests with the change.** Domain decisions are tested as plain folds, without fakes or timers.

## Changing the database schema

The plugin's state is one SQLite file, `tab-recap.db`, in its state directory (which must be on a local disk: WAL does not
work on network filesystems). Its shape lives in `tab-recap/src/adapters/db/schema/` as **numbered migrations**.

- **Add a file** `NNN-name.ts` exporting `{ version: NNN, name, up }` and list it in `schema/index.ts` (the only registry).
  `up` is a list of SQL statements, or a function taking the database.
- **Never edit a released migration** (one that is in a `tab-recap-v*` tag): a fix is a new number. `ci/check-migrations.sh`
  (part of `ci/lint.sh`) fails when a released file changed or was deleted.
- **Changing a column** SQLite cannot `ALTER`: use `rebuildTable` (`src/adapters/db/rebuild.ts`) — create the new table, copy,
  drop, rename, recreate indexes. The runner has switched foreign keys off and refuses to commit while one is broken.
  Use only SQL the SQLite bundled with Node 24.21 supports (SQLite 3.53).
- **Index every foreign-key column** (a test walks them), keep ids as UUIDv7 `BLOB(16)` for entity tables, money as integer
  millionths, times as epoch milliseconds.
- **Freeze a fixture** of the schema you release (`test/db/fixtures/schema-vN.sql`, SQL text): the migration test upgrades each
  one and compares it with a fresh install.
- **Open the database only through the repositories** in `src/adapters/db/`; a transaction is `writeTx` (`BEGIN IMMEDIATE`).

An upgrade first copies the database to `tab-recap.db.v<old>.bak` (the newest three are kept). A database written by a
**newer** plugin than the one running is opened read-only and left alone: the daemon says so and exits, the columns show the
message. **Rolling back** a schema change: stop the daemon (`tab-recap.stop`), put the plugin's older version back, restore the
backup (`cp tab-recap.db.v<n>.bak tab-recap.db`, and delete `tab-recap.db-wal` / `-shm`), start it. To go back to 1.5.1, see the
plugin's README ("State and rolling back").

## Commits

Imperative mood, scoped to the plugin: `tab-recap: reopen the column after a resync`. One logical
change per commit.

## Pull requests and the mirror

The upstream repository is the source of truth; this GitHub repository is a **push mirror of
`main`**, so anything pushed directly here is overwritten. Issues are welcome here. Pull requests
are welcome too, but the maintainer applies them upstream and they arrive back through the mirror;
your PR is then closed with a link to the commit (your authorship is kept).

## Screenshots

The README's pictures are drawn from the plugin's own views with invented data. After a change to
what the column, bar or settings modal show, regenerate and commit them:

```bash
cd tab-recap
npm install --no-save playwright-core && npx playwright-core install chromium   # once
node docs/screens/shoot.mjs      # docs/screens/render.ts (gated) → HTML → docs/screens/*.png
```

## Cutting a release

Maintainers only. The version and the notes come from the labels of the merge requests merged since
the previous `tab-recap-v*` tag: any `breaking` makes a major release, else any `added` a minor one,
else any `fixed`/`changed` a patch; only `internal` means no release.

1. Merge the merge requests (each with its label) into `main`.
2. On `main`'s pipeline, run the manual **`release:prepare`** job. It works out the next version
   (`ci/next-release.sh` prints it with the section it will write), updates the manifest,
   `package.json`, the lockfile and `CHANGELOG.md` (one bullet per MR: title and `(!number)`, grouped
   under Breaking/Added/Changed/Fixed, `internal` left out), pushes that commit to `main` and creates
   the annotated tag `tab-recap-vX.Y.Z`. If nothing is due it says so and stops.
3. The tag pipeline does the rest: `ci/check-release.sh` (name, annotated tag, commit on `main`,
   version above the previous one, the three versions equal, a dated and non-empty changelog section
   with its link, a manifest whose command files exist, no release for the tag yet), then the
   release is created from that section. The mirror carries the tag to GitHub, whose workflow tests
   it on Linux and macOS and creates the GitHub release from the same section.

`[Unreleased]` in the changelog stays empty: entries are written only by `release:prepare`
(a hand-written entry makes it stop). To preview a release, run `bash tab-recap/ci/next-release.sh`
with `CI_API_V4_URL`, `CI_PROJECT_ID` and a token in the environment. If a release is wrong, fix it
with a new patch version; never move a tag.

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
4. Wire its gates into the CI configuration (`.github/workflows/ci.yml` and `.gitlab-ci.yml`); a plugin
   that is released by tag also needs its own `ci/check-release.sh`, `ci/release-notes.sh`, `ci/next-release.sh` and `ci/prepare-release.sh`.

By contributing you agree your work is licensed under the [MIT License](LICENSE).
