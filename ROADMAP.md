# Roadmap

What is planned, per plugin. Nothing here has a date, and the order can change as people use the plugins.

**How to propose something:** open a [feature request](https://github.com/crisap94/herdr-plugins/issues/new?template=feature_request.yml)
(or a [bug report](https://github.com/crisap94/herdr-plugins/issues/new?template=bug_report.yml)) — a short description of the problem
is more useful than a design.

Status: **next** = being worked on · *planned* = intended, not started.

## tab-recap

### 1.0.x — Stability *(planned)*

*Make what shipped boring.*

- Check whether the once-a-minute `events.subscribe` stream that herdr logs as closed is expected
  or wasteful, and reduce it if it is.
- Verify macOS (declared in the manifest, not yet tested).
- Prove that opencode leaves no stored session behind after a timeout.

### 1.1 — Shipping and trust **(next)**

*Make releases checkable and the README show the thing.*

- CI on GitHub: Actions running lint and tests, with a badge in the README.
- Release automation: a tag becomes a release, with the notes taken from the changelog.
- Screenshots or a short GIF in the README.
- A CI check that the changelog has an entry for the change.

### 1.2 — Every agent gets a column *(planned)*

*Recap agents that have no transcript to read.*

- Recaps for agents without a readable transcript (gemini, cursor, opencode, …), built from the
  pane's own output.
- Harness profiles for gemini, cursor-agent, qwen and copilot, added after live probes show they can
  run without tools and without keeping a session.

### 1.3 — Git note built in *(planned)*

*See the state of the work under each agent.*

- Branch, unpushed commits and a dirty working tree shown under each agent, read with git in the
  pane's directory.

### Later

- A phone bar that never moves an agent pane (a split instead of a swap).
- More interface languages.
