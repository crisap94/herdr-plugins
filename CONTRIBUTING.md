# Contributing

Thanks for helping. Issues and pull requests are welcome.

## Layout

One plugin per directory, each self-contained (`herdr-plugin.toml` at its root), with its own `README.md`,
`CONTRIBUTING.md`, `ROADMAP.md` and `experiments/`. Setup, checks, house rules and the release steps of a
plugin are in that plugin's `CONTRIBUTING.md`, not here.

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

## Commits

Imperative mood, scoped to the plugin: `<plugin>: reopen the column after a resync`. One logical
change per commit.

## Pull requests and the mirror

The upstream repository is the source of truth; this GitHub repository is a **push mirror of
`main`**, so anything pushed directly here is overwritten. Issues are welcome here. Pull requests
are welcome too, but the maintainer applies them upstream and they arrive back through the mirror;
your PR is then closed with a link to the commit (your authorship is kept).

Tags are mirrored too. When a `<plugin>-v<x.y.z>` tag arrives, the GitHub workflow `release`
publishes the GitHub release with its built-in token. If it failed, run it by hand with the tag.

## Bug reports

Please include:

- `herdr --version`
- the plugin and its version, and what that plugin's `CONTRIBUTING.md` asks for (usually its status output and log lines)
- what you did and what you expected to happen

## Adding a plugin

1. Create `<plugin>/` at the repo root with a `herdr-plugin.toml` (`id`, `name`, `version`,
   `min_herdr_version`, `description`, `platforms`).
2. Give it a `README.md`, a `CONTRIBUTING.md`, a `ROADMAP.md`, an `experiments/` folder, a `CONTEXT.md` (its vocabulary, enforced by a lint rule), a `CLAUDE.md`
   (layers and red lines) and its own `ci/lint.sh` and `ci/test.sh`.
3. Write its house rules in its `CONTRIBUTING.md`, add a `## <plugin>` section to [`CHANGELOG.md`](CHANGELOG.md),
   add a row to the table in the root [`README.md`](README.md) and a line to [`ROADMAP.md`](ROADMAP.md).
4. Wire its gates into the CI configuration (`.github/workflows/ci.yml` and `.gitlab-ci.yml`); a plugin
   that is released by tag also needs its own `ci/check-release.sh`, `ci/release-notes.sh`, `ci/next-release.sh` and `ci/prepare-release.sh`.

By contributing you agree your work is licensed under the [MIT License](LICENSE).
