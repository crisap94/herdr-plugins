# Changelog

All notable changes are documented here. The format follows
[Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/) and each plugin follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## tab-recap

### [Unreleased]

### [1.5.0] — 2026-10-05

#### Added

- tab-recap: show the installed version in the column and flag a stale daemon (!15)

#### Fixed

- tab-recap: stop opening a second column when a snapshot arrives late, and close extra ones (!14)

### [1.4.1] — 2026-10-05

#### Fixed

- tab-recap: make the hide/show keys flip reliably, however fast you press them (!12)

### [1.4.0] — 2026-10-05

#### Added

- tab-recap: keep each lane's last prompt live in its header (!11)

#### Changed

- tab-recap: dock the phone bar without moving any agent pane (!10)

### [1.3.0] — 2026-10-05

#### Added

- tab-recap: show branch, unpushed and changed files under each agent (git note) (!8)

### [1.2.0] — 2026-10-05

#### Added

- tab-recap: every agent gets a column — opencode by default, any other agent from its screen (!6)
- tab-recap: tasks within a tab — unrelated agents get their own recap (!7)

### [1.1.0] — 2026-10-05

#### Added

- tab-recap: hide or show the recap column with a key (!1)

#### Changed

- tab-recap: give every recap the same seven short sections (!3)

### [1.0.1] — 2026-10-04

#### Changed

- The once-a-minute refresh no longer opens a new event subscription (herdr logged one stream per minute for nothing): it takes a snapshot only. A new subscription is opened when the watch set changes, when the stream ends, and on every 10th minute as a safety net against a half-open connection.

#### Fixed

- A subscription that herdr never acknowledges is abandoned after 10 seconds and retried with backoff, instead of hanging.
- A summarizer that times out is killed with its whole process group (SIGTERM, then SIGKILL after 5 seconds), and a grandchild that keeps the pipes open can no longer hold the daemon waiting forever.
- A program that exits without reading its input (for example a missing or crashing harness) no longer crashes the daemon with `write EPIPE`.
- opencode: a run killed before it reported its session id has its stored session found by title and deleted, with one more look a few seconds later in case opencode was still writing it.

### [1.0.0] — 2026-10-04

First public release.

#### Added

- A recap column on the right of every tab that has a coding agent: one rolling, structured recap
  per tab (Goal · Now · Waiting on you · Done · Decisions · Next · Key refs), built from the
  previous recap plus only the new part of every agent's transcript.
- A one-row bar for narrow tabs (phone clients), with a status dot per agent and one headline.
  Tapping the bar, or the column, opens the full recap as a modal.
- Recaps written at the end of each turn, on tab focus when stale, and on demand (`r`), by any
  harness: `claude`, `codex`, `opencode`, `hermes` (`auto` picks the first available), or a custom
  command.
- A settings modal (`tab-recap.configure`): agent, model, recap length, interface language and
  recap language, with a test button.
- English and Spanish for the interface, and a recap language of `en`, `es` or any language you name.
- An extension point for optional add-ons (notes under a lane's header, housekeeping on the
  daemon's tick); none are loaded by default.
- Read-only by construction: it reads transcripts and never types into an agent, enforced by lint rules.

#### Fixed

- The daemon recovers on its own when herdr's event subscription names a pane that is gone (it used to stay blind until restarted); failed subscriptions are retried with backoff.
- A pane is taken for a recap column only if its title is exactly `tab-recap` or `tab-recap:bar`, it hosts no agent and, when herdr reports one, its label is the manifest's. Before, any pane whose title merely *started with* `tab-recap` (for example an agent session named `tab-recap-harness-config`) was adopted as a column and closed with the columns when the daemon stopped.
- A recap never closes, resizes or moves a pane that hosts an agent: enforced where the board adopts columns, in the close-column intents, and at the herdr edge, which checks the pane in a fresh snapshot before `pane.close`, `pane.resize` and `pane.swap` and refuses (with a log line) if it hosts an agent.

[Unreleased]: https://github.com/crisap94/herdr-plugins/compare/tab-recap-v1.5.0...HEAD
[1.5.0]: https://github.com/crisap94/herdr-plugins/compare/tab-recap-v1.4.1...tab-recap-v1.5.0
[1.4.1]: https://github.com/crisap94/herdr-plugins/compare/tab-recap-v1.4.0...tab-recap-v1.4.1
[1.4.0]: https://github.com/crisap94/herdr-plugins/compare/tab-recap-v1.3.0...tab-recap-v1.4.0
[1.3.0]: https://github.com/crisap94/herdr-plugins/compare/tab-recap-v1.2.0...tab-recap-v1.3.0
[1.2.0]: https://github.com/crisap94/herdr-plugins/compare/tab-recap-v1.1.0...tab-recap-v1.2.0
[1.1.0]: https://github.com/crisap94/herdr-plugins/compare/tab-recap-v1.0.1...tab-recap-v1.1.0
[1.0.1]: https://github.com/crisap94/herdr-plugins/compare/tab-recap-v1.0.0...tab-recap-v1.0.1
[1.0.0]: https://github.com/crisap94/herdr-plugins/releases/tag/tab-recap-v1.0.0
