# herdr-core 0.1.19 release notes (accessed 2026-11-08)

Sources:
- https://github.com/herdrdev/herdr-core (CHANGELOG.md at commit 9b0d7da209 "docs: release notes for 0.1.19", 2026-11-07)
- gh api repos/herdrdev/herdr-core/compare/v0.1.18...v0.1.19 (14 commits)
- gh api repos/herdrdev/herdr-core/contents/CHANGELOG.md?ref=v0.1.18 (0.1.18 section)
- Not found: https://releases.herdr.dev/core/ (HTTP 404); https://github.com/herdrdev/herdr-core/releases ("There aren't any releases here"); https://herdr.dev/core/ and https://herdr.dev/blog/ (no 0.1.18/0.1.19 notes); WebSearch "herdr-core 0.1.19 release notes" (no match).

## 0.1.19 (2026-11-07)

New (feature):
- "On Linux and macOS, programs you deliberately detach keep running when their terminal closes, like in tmux." (#136)
- "Updates and `hc server restart` keep the environment the core started with." (#20, #21)

Fixed:
- "On older Linux like RHEL or Rocky 8 (systemd 239), the core starts and restarts as a service." (#135)
- "On Windows, programs installed under a system PATH entry ... are found in terminals" (herdr-app#631)
- "`hc attach` no longer garbles a character that was half printed when you attached." (#144)
- "A core that's slow to start ... gets 15 seconds before hc reports that it didn't start."

Breaking/behaviour change (noted in docs):
- "Terminals opened before this update keep the old behavior until they're reopened." (detach survival)
- Environment handoff from an older core to 0.1.19 uses the updater's environment once.

## 0.1.18 (2026-11-04), for comparison

- New: macOS core is its own app, Herdr Core (#100); `hc wait --children` (#94); apps can start a terminal at pane size and colors (#88).
- Fixed: template first message retried up to a minute (#85); terminal replies no longer resize idle viewers (#69); macOS file limit raised from 256 (#110); `hc ls`/`hc get` show current folder.

## Commits 0.1.18..0.1.19 not in CHANGELOG (fix/test/ci)
- cd12ddd88b fix: make restart environment handoffs best effort and single-use
- 1fe7bc6596 fix(linux): support service startup and planned restarts on systemd 239 (#135)
- 72f77c4a3f fix: fall back to serving core when hc is missing from path
- 9ce385d9c8 revert: drop the core's own-hc fallback for terminal programs
- c0a205eea0 fix(windows): expand system path references before spawning terminals
- ad23942bc9 fix: give a starting core or holder 15 s before reporting it failed
- de6cc39a08 fix: preserve detached processes on normal terminal end
- c6b316f87c fix: preserve core environment across planned restarts (#21)
- f4ca1c0714 fix: hc attach keeps a character the first paint cut in half (#144)
- 06793ede1b / de0c6c1a0f / aef2dac358: test and ci only
