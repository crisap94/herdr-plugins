# Search log: README and repository hygiene (R-2026-11-08-02)

Date of access for every row: 2026-11-08. Method: external reading of the listed pages. "Fetched" means the page was read in this study; "not fetched" means it was not.

## README sources

| Code | URL | Fetched | Taken from it |
| --- | --- | --- | --- |
| SR | https://github.com/RichardLitt/standard-readme/blob/main/spec.md | yes | Required sections and order: title, short description under 120 characters, install, usage, contributing, license last; CLI usage subsection |
| MAR | https://www.makeareadme.com/ | yes | Recommended sections: what and why, features, API, support, status |
| GHR | https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-readmes | yes | README location (root, .github, docs), 500 KiB truncation |
| GHCP | https://docs.github.com/en/communities/setting-up-your-project-for-healthy-contributions/about-community-profiles-for-public-repositories | yes | Community profile checks: README, LICENSE, CONTRIBUTING, CODE_OF_CONDUCT, issue forms |
| NPMR | https://docs.npmjs.com/about-package-readme-files | yes | npm renders the package-root README; the page updates on publish |
| NPMP | https://docs.npmjs.com/cli/v10/configuring-npm/package-json | yes | description, license, repository (with directory), bugs, homepage, exports, engines |
| PROV | https://docs.npmjs.com/generating-provenance-statements | yes | repository must match the source repo exactly, case-sensitive; trusted publishing; npm 9.5.0+ |
| HONO | https://raw.githubusercontent.com/honojs/hono/main/README.md | yes | One-line pitch, install, runnable snippet near the top, many badges |
| ZOD | https://raw.githubusercontent.com/colinhacks/zod/main/packages/zod/README.md | yes | One-line pitch, install, runnable snippet |
| DRIZ | https://raw.githubusercontent.com/drizzle-team/drizzle-orm/main/README.md | yes | No badges, feature list |
| MCPFS | https://raw.githubusercontent.com/modelcontextprotocol/servers/main/src/filesystem/README.md | yes | Tool list with inputs and hints, per-client JSON config, security scope (one sample) |
| effect | (README of the effect library) | not fetched | Not used; listed as a deviation |

## Hygiene sources

| Code | URL | Fetched | Taken from it |
| --- | --- | --- | --- |
| CPROF | https://docs.github.com/en/communities/setting-up-your-project-for-healthy-contributions/about-community-profiles-for-public-repositories | yes | Community profile checks |
| PROV | https://docs.npmjs.com/generating-provenance-statements | yes | Provenance repository match rule |
| PKGJ | https://docs.npmjs.com/cli/v10/configuring-npm/package-json | yes | Package metadata fields |
| NODEPK | https://nodejs.org/api/packages.html | yes | exports, types, files, engines |
| SCORE | https://github.com/ossf/scorecard/blob/main/docs/checks.md | yes | Scorecard check list (version not checked) |
| BP0 | https://www.bestpractices.dev/en/criteria/0 | yes | OpenSSF criteria, including the 14-day vulnerability response |
| KAC | https://keepachangelog.com/en/1.1.0/ | yes | Changelog format |
| SEMVER | https://semver.org/ | yes | Versioning, 0.y.z while unstable |
| CODEOWNERS page | GitHub CODEOWNERS docs | not fetched | Rests on the community-profile page and general knowledge |
| FUNDING page | GitHub FUNDING.yml docs | not fetched | General knowledge |
| SUPPORT page | GitHub SUPPORT docs | not fetched | Rests on the community-profile page |
| PR template page | GitHub PR template docs | not fetched | General knowledge |
