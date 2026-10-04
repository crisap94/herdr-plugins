# Changelog

All notable changes are documented here. The format follows
[Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/) and each plugin follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## tab-recap

### [Unreleased]

#### Fixed

- The daemon recovers on its own when herdr's event subscription drops.
- A pane is taken for a recap column only if its title is exactly `tab-recap` or `tab-recap:bar`, it hosts no agent and, when herdr reports one, its label is the manifest's. Before, any pane whose title merely *started with* `tab-recap` (for example an agent session named `tab-recap-harness-config`) was adopted as a column and closed with the columns when the daemon stopped.
- A recap never closes, resizes or moves a pane that hosts an agent: enforced where the board adopts columns, in the close-column intents, and at the herdr edge, which checks the pane in a fresh snapshot before `pane.close`, `pane.resize` and `pane.swap` and refuses (with a log line) if it hosts an agent.

### [0.1.0] — 2026-10-04

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

[Unreleased]: https://github.com/crisap94/herdr-plugins/commits/main
[0.1.0]: https://github.com/crisap94/herdr-plugins/commits/main
