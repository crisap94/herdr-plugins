**README checklist for a TypeScript library on npm with a public GitHub repo**
Fetched 2026-11-08. Items marked "(practice)" come from the sampled READMEs or my own experience, not from a spec. Source codes are listed at the end.

**A. Required** (order follows [SR])
1. **Title** that matches the repo and npm package name. A mismatch is allowed only if you explain it. [SR]
2. **Short description**, one line under 120 characters. Keep it identical to the `package.json` description and the GitHub "About" text, because npm search and GitHub both show it. [SR][NPMJ]
3. **Install**: a copy-paste command plus runtime requirements such as Node or Bun version and peer dependencies. Readers may be beginners. [SR][MAR]
4. **Usage**: a minimal working example with expected output, imports included. Link to longer examples elsewhere. Zod and Hono both put a runnable snippet near the top. [MAR][ZOD][HONO]
5. **Contributing**: say whether PRs are accepted and where to ask questions. Link `CONTRIBUTING.md`, which also counts toward the GitHub community profile. [SR][GHCP]
6. **License**: state the SPDX id and owner, link the `LICENSE` file, and put it last. npm always ships the LICENSE and README. [SR][NPMP]

**B. Recommended**
7. **What and why**: a few paragraphs on purpose, motivation and how it differs from alternatives. Put these under "Background" or in a long description. [SR][MAR]
8. **Features**: a short bullet list. Zod, Hono and Drizzle all have one. Back any size or speed claim with a measurement. [ZOD][HONO][DRIZ]
9. **API**: exported functions, signatures, return types and caveats. If the reference is long, link to the docs site or `docs/` instead of inflating the README. [SR][MAR]
10. **Support**: where to get help, which can simply be the issue tracker. GitHub expects the README to say where help is. [GHR][MAR]
11. **Project status**: if development has slowed, say so at the top. [MAR]
12. **Security**: link `SECURITY.md`. Put it in the README only if the risk matters to users. [SR]
13. **Table of contents**: needed above 100 lines. GitHub generates its own outline, but npm does not. [SR][GHR]
14. **Badges**: keep to a few that are true: CI, npm version, license, maybe types. [SR][MAR]
15. **Visuals**: a logo, screenshot or terminal recording when it helps. [MAR]
16. **Maintainers and credits**: [SR][GHR]
17. **Docs and migration links**: Hono links `docs/MIGRATION.md`. (practice) [HONO]

**C. Ordering** (from the Standard Readme)
Title, banner, badges, short description, long description, TOC, security, background, install, usage, extra sections, API, maintainers, thanks, contributing, license. [SR] Zod and Hono front-load a one-line pitch, a tagline and links, then install and usage. (practice) [ZOD][HONO]

**D. Package and repo hygiene for npm**
- The `README` must sit at the package root. npm renders it as GitHub Flavored Markdown. [NPMR]
- The npm page updates only when you publish a new version. A README fix therefore needs a patch release. [NPMR]
- Set `repository` (with `directory` for monorepo packages), `homepage` and `bugs` in `package.json`. [NPMP]
- Use absolute `https://` URLs for images and links meant to render on npmjs.com. The npm pages I fetched do not document relative-link rewriting. Relative links work on GitHub, and GitHub itself recommends them. (practice, not in the fetched docs) [GHR]
- GitHub truncates a README above 500 KiB. [GHR]
- The README must not link to files the tarball excludes. `files` defaults to everything, but a narrow `files` list can drop them. [NPMP]
- If you publish with provenance, the public `repository` field must match the source repo. The match is case-sensitive. [PROV]
- Aim for the full GitHub community profile: README, LICENSE, CONTRIBUTING, CODE_OF_CONDUCT and issue templates in `.github/ISSUE_TEMPLATE`. [GHCP]
- Put the README at the repo root, or in `.github` or `docs`. GitHub shows `.github` first. [GHR]

**E. Anti-patterns**
- **Badges that lie.** A failing or stale CI, coverage or version badge destroys trust. Prefer a few true badges over Hono's ten, or none, as Drizzle does. [SR][HONO][DRIZ]
- **Roadmap promises.** The make-a-readme guide recommends a roadmap, but undated promises go stale. Link an issues milestone instead. (my judgement; contrast [MAR])
- **Private or internal links**, such as GitLab URLs or unpublished repos. Broken links violate the spec. [SR]
- **Absolute paths or home-directory leaks** in examples. (practice)
- **Examples that don't run**, or that skip imports. The spec says to lint code samples. [SR]
- **Name or description drift** between README, `package.json` and the GitHub About text. [SR]
- **Wall-of-text API dumps** that belong on a docs site. [MAR]
- **Marketing-only intro** with no install or usage. [GHR]
- **Stale versions** hard-coded in text. Let badges or `npm view` carry the version.

**F. CLI additions**
- Spec: a Usage subsection for the CLI is required when a CLI exists. [SR]
- Document every command and flag, ideally in a table, plus exit codes.
- Show an `npx` or `bunx` one-liner and a global install.
- Document config files and environment variables in one place.
- Include sample output or a terminal recording. [MAR]
- Declare `bin` and check that the shebang and `files` ship the entry. [NPMP]

**G. MCP server or library hybrid** (herdr-mcp)
- The reference MCP filesystem server is the real-practice model here. Its README has features, access control, an API listing every tool with inputs and notes, annotation hints, requirements, and per-client config snippets for Claude Desktop and VS Code. [MCPFS]
- Give copy-paste client JSON for `npx` and for a local build, including a Windows variant if it differs. Don't leave users to guess the `command` and `args`. [MCPFS]
- Put prerequisites up front. herdr-mcp needs a running herdr server and its socket, so say how it finds the socket. [MCPFS]
- List every tool with its inputs, plus read-only versus destructive hints. [MCPFS]
- Document security scope: what the server can touch, read-only mode, and what an agent can do through it. [MCPFS]
- If it is also importable, separate "Use as MCP server" from "Use as library".
- Document environment variables in one table. The filesystem README has none and relies on arguments. [MCPFS]

**H. Bun workspace with several packages** (harness-kit)
- Write a root README as the landing page: what the kit is, a table of packages with the npm name, a one-line purpose and a link to each, and an install-from-root note. (practice)
- Give each published package its own `README.md` at the package root. Only that file renders on npm, and the root README does not ship. [NPMR][NPMP]
- Set `repository.directory` in each package's `package.json`. [NPMP]
- Repeat the install and usage basics in every package README, since each npm page is read in isolation.
- Document the Bun requirement: the Bun version, and whether the packages run on Node or only on Bun, because that is a deal-breaker for consumers.
- Put workspace development (`bun install`, tests, release flow) in the root `CONTRIBUTING.md`, not in package READMEs. [MAR]
- Per-package license and `files` need checking, so that README and LICENSE ship in every tarball. [NPMP]

**Sources**
- [SR] https://github.com/RichardLitt/standard-readme/blob/main/spec.md
- [MAR] https://www.makeareadme.com/
- [GHR] https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-readmes
- [GHCP] https://docs.github.com/en/communities/setting-up-your-project-for-healthy-contributions/about-community-profiles-for-public-repositories
- [NPMR] https://docs.npmjs.com/about-package-readme-files
- [NPMP] https://docs.npmjs.com/cli/v10/configuring-npm/package-json
- [PROV] https://docs.npmjs.com/generating-provenance-statements
- [HONO] https://raw.githubusercontent.com/honojs/hono/main/README.md
- [ZOD] https://raw.githubusercontent.com/colinhacks/zod/main/packages/zod/README.md
- [DRIZ] https://raw.githubusercontent.com/drizzle-team/drizzle-orm/main/README.md
- [MCPFS] https://raw.githubusercontent.com/modelcontextprotocol/servers/main/src/filesystem/README.md

I did not fetch the effect README.
