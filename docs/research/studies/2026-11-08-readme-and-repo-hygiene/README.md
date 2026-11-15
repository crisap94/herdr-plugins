---
id: R-2026-11-08-02
name: "README and repository hygiene"
question: "What must the README of a public TypeScript or Bun project contain, and which community and repository files does a public repo need, so that tab-recap (a herdr plugin) and the libraries herdr-sdk, herdr-mcp and harness-kit are ready to be read and published?"
date: 2026-11-08
owner: "tab-recap maintainer"
method: external-research
status: concluded
superseded_by: null
confidence: medium
informs: [README rewrite MR (docs/readme-research), library publish readiness of herdr-sdk/herdr-mcp/harness-kit]
tags: [readme, hygiene, community-health, publishing, bun]
---

# README and repository hygiene

## Question

What must the README of a public TypeScript or Bun project contain, and which community and repository files does a public repo need, so that tab-recap (a herdr plugin) and the libraries herdr-sdk, herdr-mcp and harness-kit are ready to be read and published? Asked while rewriting tab-recap/README.md; the two inputs cover a README checklist and a repo-hygiene checklist.

## Method

External research on 2026-11-08, read-only. Inputs: `evidence/readme-checklist.md` and `evidence/hygiene-checklist.md` (the two checklists gathered that day), and `evidence/search-log.md` (every source, its access and what was taken from it).

**Protocol (written before collecting):** sources are primary docs (Standard Readme spec, GitHub community-profile and README docs, npm docs for package.json, package READMEs and provenance, OpenSSF Scorecard checks and Best Practices criteria, Keep a Changelog, SemVer, Node packages docs) plus four sampled READMEs (hono, zod, drizzle-orm, the MCP filesystem server). A claim counts as documented only if read in a fetched page; otherwise it is marked practice. Judged on whether each item can be turned into a yes/no check for a repo.

**Time box:** not recorded (neither input states one).

**Deviations:** the effect README was not fetched; the individual GitHub pages for CODEOWNERS, FUNDING, SUPPORT and PR templates were not fetched (those rest on the community-profile page and general knowledge); the Scorecard version was not checked; publint and are-the-types-wrong were suggested, not run.

## Findings

| # | Finding | Source | Accessed | Basis | Confidence |
| --- | --- | --- | --- | --- | --- |
| 1 | Standard Readme requires title, short description (under 120 chars), install, usage, contributing, license; license last; CLI usage subsection if a CLI exists | https://github.com/RichardLitt/standard-readme/blob/main/spec.md | 2026-11-08 | documented | high |
| 2 | Description should be identical in README, package.json and the GitHub About text | same URL; https://docs.npmjs.com/cli/v10/configuring-npm/package-json | 2026-11-08 | documented | high |
| 3 | Recommended: what/why, features, API (link a docs page when long), support, status, security link, TOC above 100 lines, few true badges | https://www.makeareadme.com/; https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-readmes | 2026-11-08 | documented | high |
| 4 | Zod and Hono front-load a one-line pitch then install and a runnable snippet; Drizzle has no badges | https://raw.githubusercontent.com/honojs/hono/main/README.md; https://raw.githubusercontent.com/colinhacks/zod/main/packages/zod/README.md; https://raw.githubusercontent.com/drizzle-team/drizzle-orm/main/README.md | 2026-11-08 | practice | medium |
| 5 | Anti-patterns: lying badges, undated roadmap promises, private links, home-path leaks, examples that do not run, name drift, API dumps, marketing-only intro. Mixed: SR spec and GitHub docs (documented) and the author's judgement (roadmap point is opinion; contrast makeareadme) | SR spec, GitHub README docs, makeareadme | 2026-11-08 | documented / opinion | medium |
| 6 | npm renders the package-root README and updates the page only on publish; GitHub reads the README at repo root, .github or docs, truncated above 500 KiB | https://docs.npmjs.com/about-package-readme-files; GitHub README docs | 2026-11-08 | documented | high |
| 7 | MCP server READMEs list every tool with inputs and hints, per-client JSON config, prerequisites and security scope | https://raw.githubusercontent.com/modelcontextprotocol/servers/main/src/filesystem/README.md | 2026-11-08 | practice (one sample) | medium |
| 8 | Bun workspace: one root landing README plus one README per published package; repository.directory per package | https://docs.npmjs.com/cli/v10/configuring-npm/package-json | 2026-11-08 | documented (directory field); practice (layout) | medium |
| 9 | GitHub community profile checks README, LICENSE, CONTRIBUTING, CODE_OF_CONDUCT and issue forms in .github/ISSUE_TEMPLATE | https://docs.github.com/en/communities/setting-up-your-project-for-healthy-contributions/about-community-profiles-for-public-repositories | 2026-11-08 | documented | high |
| 10 | SECURITY.md with a private channel and a response target (OpenSSF: initial response within 14 days) is a Scorecard check and an OpenSSF criterion | https://www.bestpractices.dev/en/criteria/0; https://github.com/ossf/scorecard/blob/main/docs/checks.md | 2026-11-08 | documented | high |
| 11 | Provenance needs the repository field to match the source repo exactly, case-sensitive; trusted publishing from CI; npm 9.5.0+ | https://docs.npmjs.com/generating-provenance-statements | 2026-11-08 | documented | high |
| 12 | Keep a Changelog and SemVer: dated newest-first sections, Unreleased, change types; 0.y.z while unstable | https://keepachangelog.com/en/1.1.0/; https://semver.org/ | 2026-11-08 | documented | high |
| 13 | With a read-only GitHub mirror of GitLab, several checks mislead (Branch-Protection, Code-Review, Maintained, Contributors, Dependabot); use Renovate on GitLab and keep templates in .gitlab/ | Scorecard docs (documented); author's inference | 2026-11-08 | documented / opinion | medium |
| 14 | exports, types, files, engines and type fields define the public API and the tarball | https://nodejs.org/api/packages.html; https://docs.npmjs.com/cli/v10/configuring-npm/package-json | 2026-11-08 | documented | high |

Nothing in this study is "measured": every row is read from a page, sampled from four READMEs, or judged by the author.

## Options rejected and drawbacks

- A single mega-checklist without a basis column: hides which items are opinion.
- Scoring repos with Scorecard as the goal: several checks do not fit a mirror (row 13).
- Copying Hono's ten badges: badges must be true; most are not for a plugin.
- A roadmap section in the README: opinion; link ROADMAP.md instead.
- Fetching more READMEs: diminishing value; the effect README stays unread.

Drawbacks of the recommended path: the checklists were written for npm packages, and the herdr plugin is installed by herdr's plugin installer, not npm, so npm-only items are skipped for it.

## Limits and threats to validity

Four sampled READMEs, three of them libraries rather than CLIs or plugins; one MCP sample; unfetched GitHub pages listed in Method; the Scorecard version is unknown; the checklists were written for npm packages and adapted by judgement to a herdr plugin installed through herdr. No repository was measured against them in this study.

## Recommendation

Use the checklist as the acceptance list for the README rewrite and the community files. For herdr-sdk, herdr-mcp and harness-kit, run `npm pack --dry-run` (or `bun pm pack --dry-run` if available; npm is required by the tool otherwise), then publint and are-the-types-wrong, and diff the result against the must-have list (rows 1 to 6, 11 and 14). Confidence medium.

## Open questions and follow-ups

- Does GitHub private vulnerability reporting stay enabled on the mirror?
- Does the project want a Scorecard score at all?
- The README MR must verify each command against the code; this study does not cover that.
