# Changelog

All notable changes are documented here. The format follows
[Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/) and each plugin follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## tab-recap

### [Unreleased]

### [3.7.9] — 2026-11-27

#### Fixed

- tab-recap: after herdr restarts, a stuck recap daemon is replaced instead of staying stuck. (!533)

### [3.7.8] — 2026-11-27

#### Fixed

- tab-recap: the daemon keeps running when herdr reports a detected agent with a blank pane id (!531)

### [3.7.7] — 2026-11-27

#### Fixed

- tab-recap: the column pane now shows the recap, not the protocol mismatch screen, when its output is a pipe (!529)

### [3.7.6] — 2026-11-26

#### Changed

- tab-recap: the curator waits for a pending recap run before it curates (E11b) (!476)

### [3.7.5] — 2026-11-25

#### Changed

- tab-recap: autocompact decisions are also taken when a piece of work finishes (SW-2) (!474)

### [3.7.4] — 2026-11-23

#### Changed

- tab-recap: recap jobs carry harness.job instead of tab_recap.job (UP-1) (!455)

### [3.7.3] — 2026-11-23

#### Fixed

- fix(tab-recap): ask for a faithful translation of each open fact named after a language change (!453)

### [3.7.2] — 2026-11-23

#### Fixed

- fix(tab-recap): name the open facts still in the old language after a language change (!451)

### [3.7.1] — 2026-11-22

#### Fixed

- tab-recap: the recap column narrows and widens again when the layout changes (!415)

### [3.7.0] — 2026-11-22

#### Added

- desktop: the Tab Recap mod gets a Settings page, descriptive session names, Enter to open, a scrolling Timeline and EN/ES (!372)

#### Changed

- tab-recap: the old in-process column is gone; panes always use the relay (M4b) (!367)

### [3.6.0] — 2026-11-21

#### Added

- tab-recap: a Claude lane's compact window honours what that session was started with (!364)

### [3.5.0] — 2026-11-21

#### Added

- tab-recap: Claude's own automatic compaction waits for autocompact on an idle lane (!362)

#### Fixed

- tab-recap: autocompact measures a lane against the window its agent compacts at (!360)

### [3.4.0] — 2026-11-21

#### Added

- feat(tab-recap): the brief check can run on its own model and effort (COV-1) (!358)

### [3.3.3] — 2026-11-20

#### Fixed

- fix(tab-recap): a column whose process exits no longer leaves a shell behind (COL-1) (!349)

### [3.3.2] — 2026-11-20

#### Changed

- feat(tab-recap): popups, the column and the CLI open the store as reader; the daemon stays owner (M2b-2) (!342)
- tab-recap: restore a compaction once, through the SessionStart hook (H3b) (!344)
- feat(tab-recap): self-roll on by default, documented (SW-RT1) (!345)
- tab-recap: the relay pane is the column and the view server is on by default (M4) (!346)

#### Fixed

- fix(tab-recap): a finished tab says "all done", not "no recap yet" (BAR-1) (!338)

### [3.3.1] — 2026-11-20

#### Changed

- tab-recap: smart recap pacing is the default (PACE-3) (!332)

#### Fixed

- tab-recap: the self-roll follows the install herdr reports as active, and restarts on its launcher (ROLL-1) (!334)

### [3.3.0] — 2026-11-20

#### Added

- feat(tab-recap): recap runs can wait for the tab to be on screen (PACE-2) (!322)

#### Fixed

- fix(session-ledger): reads never skip the middle of a long transcript, and recap runs can be paced by visibility (PACE-1) (!320)
- fix(tab-recap): start waits for a stopping daemon and refuses rather than starting a second one (START-1) (!327)
- fix(session-ledger): a failed store read is unknown, not no runs or no facts (STO-6) (!328)

### [3.2.0] — 2026-11-19

#### Added

- feat(tab-recap): the recap writer asks for a schema-forced answer when its harness reports schema support (KIT-19) (!315)

#### Changed

- feat(tab-recap): hooks slot on by default (H3) (!317)

#### Fixed

- fix(tab-recap): the daemon keeps a relay pane instead of closing it as a stray column (!312)
- fix(session-ledger): a new source under the same key continues the old cursor only when it holds the bytes already read (CSR-7) (!316)
- fix(tab-recap): a failed store read reports unknown, not an empty store (STO-5) (!318)

### [3.1.1] — 2026-11-18

#### Changed

- tab-recap: the recap engine now runs from the session-ledger package, with harness-hooks 0.4.0, harness-adapters 0.6.0 and herdr-sdk 0.5.0 (!261)

### [3.1.0] — 2026-11-15

#### Added

- tab-recap: let the curator take its own time limit (!205)
- tab-recap: let the curator ask for a schema answer when its harness supports one (!210)
- tab-recap: add the TAB_RECAP_CURATOR_REPAIR key, off by default (!217)
- tab-recap: add the TAB_RECAP_WRITER_CLOSE_EVIDENCE key, off by default (!218)

#### Fixed

- fix(tab-recap): handoff follow-ups: one source-refusal mapping, print logs an unreadable closed source, causes are typed (!139)
- fix(tab-recap): a tab id herdr reuses for a new tab starts from an empty ledger (!195)
- tab-recap: read the first complete JSON object of a model answer, with text around it (!200)
- tab-recap: read the reconcile answer's JSON object when text surrounds it (!201)
- tab-recap: read the story answer's JSON object when text surrounds it (!207)
- tab-recap: refuse a story over 120 words instead of cutting it (!220)

### [3.0.2] — 2026-11-13

#### Changed

- tab-recap: the settings file decides the recap language and every recap follows it (!167)

### [3.0.1] — 2026-11-10

#### Changed

- Run harness jobs through the harness-adapters runtime (!161)

### [3.0.0] — 2026-11-09

#### Breaking

- tab-recap: run on Bun 1.4.4 (!157)
- tab-recap 3.0: Bun only, Drizzle, harness-adapters and herdr-sdk, new adapters layout (!158)

#### Changed

- tab-recap: run on Bun 1.4.4 (!157)
- tab-recap 3.0: Bun only, Drizzle, harness-adapters and herdr-sdk, new adapters layout (!158)

### [2.6.2] — 2026-10-14

#### Fixed

- ci: fetch migration history in GitHub checks (!149)

### [2.6.1] — 2026-10-14

#### Fixed

- fix(tab-recap): make migration probe release-independent (!147)

### [2.6.0] — 2026-10-14

#### Added

- Continue a closed lane: list retained closures and hand one over (!121)
- feat(tab-recap): another tool can ask for a lane handoff by token, when the setting is on (!129)

#### Changed

- Keep worktree status in the tab-recap daemon, from events (!142)

#### Fixed

- fix(tab-recap): a lane that closes mid-compaction is skipped, not failed, and the flow stops spending (!119)
- fix(tab-recap): a lane closed end publishes no compact-failed event (!125)
- fix(tab-recap): token writes of a request are ordered, its ask and row are one step, and failure causes are code-only (!131)

### [2.5.0] — 2026-10-11

#### Added

- feat(tab-recap): in-flight readers for Codex and opencode, with a shadow run (!74)
- feat(recap): add opt-in writer ledger pruning (!77)
- feat(tab-recap): add opt-in job telemetry tags (!78)
- feat(tab-recap): add an optional run window for turn-ended recaps (!79)
- feat(tab-recap): register hermes with explicit capability limits (!80)
- Hand a lane's task over to another lane with tab-recap handoff (!111)

#### Changed

- Add autocompact coverage gate (!76)
- One typed token protocol for every exchange with another tool (!89)
- docs(openspec): autocompact-ceiling-over-in-flight, compact full lanes that wait (!102)
- docs(openspec): autocompact-brief-kept, a written brief is never thrown away (!104)
- feat(tab-recap): a written brief below the ceiling is typed, not thrown away (!109)

#### Fixed

- fix(tab-recap): apply the size ladder only to Claude-sized windows (!71)
- feat(tab-recap): the domain of a compaction that waits for the lane (!103)
- feat(tab-recap): a full lane compacts past an awaited reply (!105)
- feat(tab-recap): Claude's in-flight reader tells background work apart (!106)
- fix(tab-recap): a compaction is queued behind the current turn instead of refused (!107)
- fix(tab-recap): Claude queues a compaction behind its turn and keeps its background work out of the gate (!113)
- fix(tab-recap): a ceiling decision keeps its flight detail beside the coverage reason (!116)

### [2.4.0] — 2026-10-10

#### Added

- tab-recap: compact without the note popup (setting, --note) (!58)
- tab-recap: autocompact style (gentle | balanced | eager) (!59)

#### Fixed

- tab-recap: one compaction per lane (a second request joins) (!60)
- tab-recap: a compaction is confirmed in the lane's current session (!61)

### [2.3.0] — 2026-10-10

#### Added

- tab-recap: lane tokens and events on herdr's stream (off by default) (!57)

### [2.2.1] — 2026-10-08

#### Changed

- tab-recap: autocompact sweeps every idle agent, records why it skips, one at a time (2.2.1) (!54)

### [2.2.0] — 2026-10-08

#### Added

- tab-recap: autocompact — the plugin compacts an agent at a safe moment (shadow first) (!51)

### [2.1.1] — 2026-10-08

#### Changed

- tab-recap: a column is closed once and never doubled while herdr still holds it (!49)

### [2.1.0] — 2026-10-08

#### Added

- tab-recap: judge recall on the ledger's state, anchor every fact to its input, flag what only looks wrong and retry only what is refused (!42)
- tab-recap: read a turn in chunks and reconcile it with the ledger behind a pipeline switch (default: the single call); the curator reconciles open facts (!43)

#### Fixed

- tab-recap: the rubric's I5 allows a lane label before a colon in `now` (!45)

### [2.0.0] — 2026-10-07

#### Breaking

- tab-recap: keep the recap as a ledger of facts the writer updates with operations (!38)

#### Added

- tab-recap: show a compaction's progress on the lane and confirm it on herdr's push (!36)
- tab-recap: check every recap item against a rubric, gate it, and judge stored recaps (tab-recap eval) (!37)
- tab-recap: add the expanded view and the curator (!39)
- tab-recap: record chapters and breaks, mark settled facts in the brief, forget closed tabs, document 2.0 (!40)

#### Changed

- tab-recap: keep the recap as a ledger of facts the writer updates with operations (!38)

### [1.10.0] — 2026-10-07

#### Added

- tab-recap: say when Node is too old, per OS, and open the settings with s (!34)

### [1.9.0] — 2026-10-07

#### Added

- tab-recap: write the compaction brief from the whole session, and send /compact in pieces (!33)

### [1.8.1] — 2026-10-06

#### Fixed

- tab-recap: a branch with a dash no longer breaks the column's links (!31)

### [1.8.0] — 2026-10-06

#### Added

- tab-recap: compact an agent from the recap, with an optional note and a context hint (!29)

### [1.7.0] — 2026-10-06

#### Added

- tab-recap: make references in the recap clickable (merge requests, commits, branches, files, URLs) (!28)

### [1.6.2] — 2026-10-06

#### Changed

- tab-recap: require Node 24.21 and give the recap writer timed, structured XML context at low effort (!25)

### [1.6.1] — 2026-10-06

#### Fixed

- tab-recap: measure text in terminal cells and never cut through a character (!24)

### [1.6.0] — 2026-10-06

#### Added

- tab-recap: follow NO_COLOR and FORCE_COLOR, add --help and refuse unknown options (!22)

### [1.5.2] — 2026-10-06

#### Changed

- tab-recap: keep the plugin state in SQLite (!20)

### [1.5.1] — 2026-10-05

#### Fixed

- tab-recap: close every column when the daemon stops, and roll columns to a new version in place (!16)

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

[Unreleased]: https://github.com/crisap94/herdr-plugins/compare/tab-recap-v3.7.9...HEAD
[3.7.9]: https://github.com/crisap94/herdr-plugins/compare/tab-recap-v3.7.8...tab-recap-v3.7.9
[3.7.8]: https://github.com/crisap94/herdr-plugins/compare/tab-recap-v3.7.7...tab-recap-v3.7.8
[3.7.7]: https://github.com/crisap94/herdr-plugins/compare/tab-recap-v3.7.6...tab-recap-v3.7.7
[3.7.6]: https://github.com/crisap94/herdr-plugins/compare/tab-recap-v3.7.5...tab-recap-v3.7.6
[3.7.5]: https://github.com/crisap94/herdr-plugins/compare/tab-recap-v3.7.4...tab-recap-v3.7.5
[3.7.4]: https://github.com/crisap94/herdr-plugins/compare/tab-recap-v3.7.3...tab-recap-v3.7.4
[3.7.3]: https://github.com/crisap94/herdr-plugins/compare/tab-recap-v3.7.2...tab-recap-v3.7.3
[3.7.2]: https://github.com/crisap94/herdr-plugins/compare/tab-recap-v3.7.1...tab-recap-v3.7.2
[3.7.1]: https://github.com/crisap94/herdr-plugins/compare/tab-recap-v3.7.0...tab-recap-v3.7.1
[3.7.0]: https://github.com/crisap94/herdr-plugins/compare/tab-recap-v3.6.0...tab-recap-v3.7.0
[3.6.0]: https://github.com/crisap94/herdr-plugins/compare/tab-recap-v3.5.0...tab-recap-v3.6.0
[3.5.0]: https://github.com/crisap94/herdr-plugins/compare/tab-recap-v3.4.0...tab-recap-v3.5.0
[3.4.0]: https://github.com/crisap94/herdr-plugins/compare/tab-recap-v3.3.3...tab-recap-v3.4.0
[3.3.3]: https://github.com/crisap94/herdr-plugins/compare/tab-recap-v3.3.2...tab-recap-v3.3.3
[3.3.2]: https://github.com/crisap94/herdr-plugins/compare/tab-recap-v3.3.1...tab-recap-v3.3.2
[3.3.1]: https://github.com/crisap94/herdr-plugins/compare/tab-recap-v3.3.0...tab-recap-v3.3.1
[3.3.0]: https://github.com/crisap94/herdr-plugins/compare/tab-recap-v3.2.0...tab-recap-v3.3.0
[3.2.0]: https://github.com/crisap94/herdr-plugins/compare/tab-recap-v3.1.1...tab-recap-v3.2.0
[3.1.1]: https://github.com/crisap94/herdr-plugins/compare/tab-recap-v3.1.0...tab-recap-v3.1.1
[3.1.0]: https://github.com/crisap94/herdr-plugins/compare/tab-recap-v3.0.2...tab-recap-v3.1.0
[3.0.2]: https://github.com/crisap94/herdr-plugins/compare/tab-recap-v3.0.1...tab-recap-v3.0.2
[3.0.1]: https://github.com/crisap94/herdr-plugins/compare/tab-recap-v3.0.0...tab-recap-v3.0.1
[3.0.0]: https://github.com/crisap94/herdr-plugins/compare/tab-recap-v2.6.2...tab-recap-v3.0.0
[2.6.2]: https://github.com/crisap94/herdr-plugins/compare/tab-recap-v2.6.1...tab-recap-v2.6.2
[2.6.1]: https://github.com/crisap94/herdr-plugins/compare/tab-recap-v2.6.0...tab-recap-v2.6.1
[2.6.0]: https://github.com/crisap94/herdr-plugins/compare/tab-recap-v2.5.0...tab-recap-v2.6.0
[2.5.0]: https://github.com/crisap94/herdr-plugins/compare/tab-recap-v2.4.0...tab-recap-v2.5.0
[2.4.0]: https://github.com/crisap94/herdr-plugins/compare/tab-recap-v2.3.0...tab-recap-v2.4.0
[2.3.0]: https://github.com/crisap94/herdr-plugins/compare/tab-recap-v2.2.1...tab-recap-v2.3.0
[2.2.1]: https://github.com/crisap94/herdr-plugins/compare/tab-recap-v2.2.0...tab-recap-v2.2.1
[2.2.0]: https://github.com/crisap94/herdr-plugins/compare/tab-recap-v2.1.1...tab-recap-v2.2.0
[2.1.1]: https://github.com/crisap94/herdr-plugins/compare/tab-recap-v2.1.0...tab-recap-v2.1.1
[2.1.0]: https://github.com/crisap94/herdr-plugins/compare/tab-recap-v2.0.0...tab-recap-v2.1.0
[2.0.0]: https://github.com/crisap94/herdr-plugins/compare/tab-recap-v1.10.0...tab-recap-v2.0.0
[1.10.0]: https://github.com/crisap94/herdr-plugins/compare/tab-recap-v1.9.0...tab-recap-v1.10.0
[1.9.0]: https://github.com/crisap94/herdr-plugins/compare/tab-recap-v1.8.1...tab-recap-v1.9.0
[1.8.1]: https://github.com/crisap94/herdr-plugins/compare/tab-recap-v1.8.0...tab-recap-v1.8.1
[1.8.0]: https://github.com/crisap94/herdr-plugins/compare/tab-recap-v1.7.0...tab-recap-v1.8.0
[1.7.0]: https://github.com/crisap94/herdr-plugins/compare/tab-recap-v1.6.2...tab-recap-v1.7.0
[1.6.2]: https://github.com/crisap94/herdr-plugins/compare/tab-recap-v1.6.1...tab-recap-v1.6.2
[1.6.1]: https://github.com/crisap94/herdr-plugins/compare/tab-recap-v1.6.0...tab-recap-v1.6.1
[1.6.0]: https://github.com/crisap94/herdr-plugins/compare/tab-recap-v1.5.2...tab-recap-v1.6.0
[1.5.2]: https://github.com/crisap94/herdr-plugins/compare/tab-recap-v1.5.1...tab-recap-v1.5.2
[1.5.1]: https://github.com/crisap94/herdr-plugins/compare/tab-recap-v1.5.0...tab-recap-v1.5.1
[1.5.0]: https://github.com/crisap94/herdr-plugins/compare/tab-recap-v1.4.1...tab-recap-v1.5.0
[1.4.1]: https://github.com/crisap94/herdr-plugins/compare/tab-recap-v1.4.0...tab-recap-v1.4.1
[1.4.0]: https://github.com/crisap94/herdr-plugins/compare/tab-recap-v1.3.0...tab-recap-v1.4.0
[1.3.0]: https://github.com/crisap94/herdr-plugins/compare/tab-recap-v1.2.0...tab-recap-v1.3.0
[1.2.0]: https://github.com/crisap94/herdr-plugins/compare/tab-recap-v1.1.0...tab-recap-v1.2.0
[1.1.0]: https://github.com/crisap94/herdr-plugins/compare/tab-recap-v1.0.1...tab-recap-v1.1.0
[1.0.1]: https://github.com/crisap94/herdr-plugins/compare/tab-recap-v1.0.0...tab-recap-v1.0.1
[1.0.0]: https://github.com/crisap94/herdr-plugins/releases/tag/tab-recap-v1.0.0
