Checklist for a public TypeScript library repo and npm package, 2026-11-08. Fetched primary sources: the GitHub community-profile page, the npm provenance, package.json and Node packages docs, the Scorecard checks, the OpenSSF criteria, Keep a Changelog and SemVer. I did not fetch the individual GitHub pages for CODEOWNERS, FUNDING, SUPPORT or the PR template, so those entries rest on the community-profile page and general knowledge. The Scorecard file on GitHub was the one I got, and I did not check which Scorecard version it describes.

Mirror marker: **[M]** means it does not apply, or applies differently, when GitHub is a read-only mirror of GitLab.

## Must-have

1. **LICENSE file at the root.** npm always packs it, GitHub's community profile checks for it, Scorecard "License" and the OpenSSF badge both require it. Use an OSI license. https://docs.github.com/en/communities/setting-up-your-project-for-healthy-contributions/about-community-profiles-for-public-repositories, https://github.com/ossf/scorecard/blob/main/docs/checks.md
2. **`license` in package.json as an SPDX id**, for example `"MIT"`. Consumers and tooling read this field. https://docs.npmjs.com/cli/v10/configuring-npm/package-json
3. **`name`, `version`, `description`, `keywords`.** These drive `npm search` and identify the package. Use a scoped name if it is unscoped-taken. Same source as item 2.
4. **`repository` (`type`, `url`; add `directory` in a monorepo).** `npm repo` uses it, and provenance requires it to match the source repo exactly, case-sensitive. https://docs.npmjs.com/generating-provenance-statements
5. **`bugs` and `homepage`.** `npm bugs` uses `bugs`. **[M]** Point `bugs` at the GitLab issue tracker, not GitHub. Same source as item 2.
6. **`exports` with `types` first, `import`/`require`, and `default` last.** Unlisted subpaths are blocked, so exports define your public API. Keep `main` and `types` alongside it for older tooling. https://nodejs.org/api/packages.html
7. **Explicit `"type": "module"` or `"commonjs"`.** Node docs recommend always setting it, and it decides how `.js` files are read. Same source as item 6.
8. **`files` allowlist (`dist`, and so on) and a `prepack` build.** The default is `["*"]`, which risks leaking source, tests or secrets. Check with `npm pack --dry-run`. https://docs.npmjs.com/cli/v10/configuring-npm/package-json
9. **`engines.node`.** It is advisory only but tells consumers what is supported. Same source as item 8.
10. **SECURITY.md** with a private reporting channel, a response target (OpenSSF says an initial response within 14 days) and a disclosure timeline. Scorecard "Security-Policy" checks it. https://www.bestpractices.dev/en/criteria/0, https://github.com/ossf/scorecard/blob/main/docs/checks.md
11. **Versioning by SemVer, with git tags.** A unique version per release is required. Declare the public API, which here is the `exports` map. Stay at `0.y.z` while unstable. https://semver.org/
12. **CHANGELOG.md in Keep a Changelog format.** Newest first, dated, an `Unreleased` section, a SemVer statement, and the change types Added, Changed, Deprecated, Removed, Fixed and Security. OpenSSF requires substantive release notes. https://keepachangelog.com/en/1.1.0/
13. **Automated tests with run instructions, plus a linter or strict `tsc`, running in CI.** OpenSSF requires a working build and test suite. Scorecard "CI-Tests" also checks them. https://www.bestpractices.dev/en/criteria/0
14. **No committed secrets or binaries.** OpenSSF forbids leaked credentials, and Scorecard "Binary-Artifacts" checks the repo. Same sources as item 13.
15. **HTTPS everywhere.** All repo, site and download URLs use HTTPS (OpenSSF basics). https://www.bestpractices.dev/en/criteria/0

## Should-have

1. **CONTRIBUTING.md** covering how to report bugs, the dev setup, and the contribution process. It is a GitHub community-profile item and OpenSSF requires the contribution process. **[M]** Say that contributions go through GitLab merge requests, and that GitHub PRs are not merged.
2. **CODE_OF_CONDUCT.md**, for example Contributor Covenant. It is a community-profile item. Same source as item 1.
3. **Issue templates and SUPPORT.md.** Issue forms must live in `.github/ISSUE_TEMPLATE` with valid YAML to earn the checkmark. **[M]** Only useful if issues are enabled on GitHub. Otherwise SUPPORT.md or the README should point to GitLab. Same source as item 1.
4. **npm provenance via trusted publishing from CI.** Needs npm CLI 9.5.0 or later, a cloud-hosted runner and `id-token: write`. No long-lived tokens are needed, and provenance is generated automatically. GitLab CI/CD is supported (`SIGSTORE_ID_TOKEN`, audience `sigstore`). **[M]** Publish from GitLab CI with `repository` pointing at the GitLab URL, or from GitHub Actions on tag, but not both. https://docs.npmjs.com/generating-provenance-statements
5. **`publishConfig` with `access: "public"`**, and `provenance: true` if you do not use trusted publishing. This matters for scoped first publishes. Same source as item 4.
6. **Dependency update tool.** Scorecard "Dependency-Update-Tool" accepts Dependabot or Renovate. **[M]** Renovate on GitLab is the working route, because Dependabot PRs on a read-only mirror go nowhere. https://github.com/ossf/scorecard/blob/main/docs/checks.md
7. **Static analysis (CodeQL, Semgrep or similar) and least-privilege CI tokens.** Scorecard checks SAST and Token-Permissions, and OpenSSF requires static analysis on major releases. **[M]** Scorecard reads GitHub workflows only, so equivalents on GitLab CI will not show in the score.
8. **Pinned CI dependencies and a lockfile.** Scorecard "Pinned-Dependencies" covers build and release steps. Same source as item 7.
9. **Declaration maps, or sources shipped for debugging.** Consumers get usable go-to-definition and stack traces. Related to the `exports` guidance in https://nodejs.org/api/packages.html
10. **Reference docs for the public API (TypeDoc or the README).** OpenSSF asks for basic and interface reference documentation. https://www.bestpractices.dev/en/criteria/0
11. **Fix known vulnerabilities in dependencies.** OpenSSF says fix medium-or-higher publicly known vulnerabilities within 60 days. Run `npm audit` in CI. Scorecard "Vulnerabilities" uses OSV. Same sources as item 7.

## Nice-to-have

1. **OpenSSF Best Practices badge (passing level).** It is an external bar and Scorecard "CII-Best-Practices" rewards it. https://www.bestpractices.dev/en/criteria/0
2. **SBOM as a release artifact.** Scorecard "SBOM". https://github.com/ossf/scorecard/blob/main/docs/checks.md
3. **Signed releases with SLSA provenance.** Scorecard "Signed-Releases". npm provenance partly covers this for the package, but not for GitHub release assets. Same source as item 2.
4. **CODEOWNERS.** **[M]** Mostly does not apply, because review happens on GitLab. Use GitLab's own CODEOWNERS there.
5. **FUNDING.yml.** Optional, and shows the Sponsor button only on GitHub.
6. **PR template.** **[M]** Does not apply to the GitHub mirror. Put the template in `.gitlab/merge_request_templates/` instead.
7. **`sideEffects: false`** if the library is truly side-effect free. Bundlers use it for tree-shaking. Node ignores it, and its docs say to check your bundler's docs. https://nodejs.org/api/packages.html
8. **Fuzzing or property-based tests.** Scorecard "Fuzzing". Low value for most libraries.
9. **Pre-commit hooks, `.editorconfig`, engines pinned in `.nvmrc`.** Contributor convenience only. I did not check a source for these.

## Scorecard checks that do not fit a mirror

Scorecard reads the GitHub repository. These checks will mislead or score low, and that is expected:

- **Branch-Protection and Code-Review.** They assume PRs on GitHub. Do both on GitLab, with protected branches and approvals.
- **Contributors.** Needs at least 3 companies, each with at least 5 commits. Unrealistic for a solo or small project.
- **Maintained.** Needs commits in at least one week of each of the previous 90 days. The mirror must sync often, and the check goes red if the mirror stalls.
- **Webhooks.** Not relevant unless you add some.

## Suggested next step

Per repo (herdr-mcp, harness-kit), run `npm pack --dry-run` and `publint` or `are-the-types-wrong`. Both are my suggestion, not covered by the sources above. Then diff the repo against the must-have list.
