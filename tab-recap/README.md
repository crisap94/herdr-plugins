# Tab Recap

A **recap column** pinned to the right of every herdr tab that has a coding agent in it. It keeps
a rolling, structured recap of the conversation, so a long session never loses its thread:

```text
 Payments API migration
 ● idle · claude · recap 2m ago
 ⚑ idle 12m ago · feat/x · 7 unmerged · dirty
 › keep the old endpoint until Friday

 GOAL
 Move checkout to the v2 API
 NOW
 • Running CI on !940
 NEEDS YOU
 • Approve the prod deploy
 DONE · DECISIONS · NEXT · LINKS
```

The recap always has the same seven sections in the same order (Goal, Now, Needs you, Done,
Decisions, Next, Links), an empty one shows `—`, and each is capped (the goal is one line; 3 to 6
bullets elsewhere, 16 words at most per line). The limits are enforced in code, not left to the model.

- **On a phone, a bar.** A narrow tab gets a one-row bar along the bottom instead — a status dot
  per agent and one headline (what needs you, else what is happening now). **Tap it** (or tap the
  column on a desktop) and the full recap opens as a modal over everything; `q` closes it.
- **Know what is deployed.** The column's top line ends with the plugin version on disk (`· v1.8.0`); when the running daemon is another version, a yellow `daemon v1.7.0 — restart` says so.
- **Per tab, by default.** A daemon opens the column in every tab with an agent of a kind in
  `TAB_RECAP_AGENTS` (default `claude`, `codex` and `opencode`), the moment the agent appears, keeps it narrow, and reopens it if it is closed (up to
  3 times in 2 minutes — then it respects you for 10 minutes, `TAB_RECAP_GIVE_UP_MS`).
- **One recap per piece of work, from all its panes.** Every agent in the tab gets a short header (title,
  status, extension notes, last prompt); below them, ONE recap covers the tab's work as a whole. A tab
  is not assumed to be one task: when its agents work on unrelated things (different repositories, say),
  the writer groups them into **tasks** and each task gets its own recap under its own name — the grouping
  stays put unless the writer gives evidence for changing it. The bar's headline takes the most urgent
  "needs you" of any task.
- **Every agent can get a column.** `claude`, `codex` and `opencode` are read from their own history
  (opencode's SQLite database is opened read-only). Any other agent herdr recognises can be read from its
  **screen** instead — `TAB_RECAP_SCREEN_AGENTS=gemini,qwen` (or `all`), also a row in the settings; its
  header says `(screen)`, because an agent on the alternate screen shows only what is visible. Reading
  a screen never types into the pane.
- **Written at the end of each turn** by any harness — `claude`, `codex`, `opencode`, `hermes` (the
  first one found, or the one you pick), or your own command —
  from the previous recap plus only the new part of every agent's transcript. Also on tab focus when
  stale, and on `r` in the column or the modal. `hermes` runs in safe mode with only its `clarify` tool
  (it cannot run with zero tools; `clarify` cannot touch files, a shell or the network).
- **Clickable references.** Every merge request (`!252`), pull request or issue (`#12`), commit, branch
  and file written in backticks, and every full URL, is an OSC 8 hyperlink that herdr opens on
  Ctrl-click — in every section, in the column and the modal, also when it wraps. The address comes from
  the repository's `origin` remote (ssh made https, credentials never kept; github.com gets GitHub
  paths, other hosts GitLab paths); files open on the agent's current branch. When a task's agents work
  in different repositories, only full URLs are linked.
- **What the writer sees.** One XML document per run, defined by
  [`schema/recap-input.dtd`](schema/recap-input.dtd) and validated in tests: the tab's agents (folder,
  repository, branch, recently edited files), the previous recap, the agents' own away and compaction
  summaries as hints, and per agent the new prompts (including ones typed while it was busy), replies
  (beginning and end) and tool calls (Codex's decoded; plain reads only counted), each with its time.
  The writer runs at `TAB_RECAP_EFFORT` (`low` by default) and drops any earlier item the transcript
  contradicts.
- **Extensible.** An optional extension can add notes under a lane's header and do housekeeping
  on the daemon's tick (see `src/extensions/` and `CONTEXT.md`); none are loaded by default.
- **English or Spanish.** The column and the commands speak `en` or `es` (`TAB_RECAP_LOCALE`), and the recap can be
  written in either or in any language you name (`TAB_RECAP_RECAP_LANG`); switching rewrites it at once.
- **Read-only, but for one thing you ask for.** It reads transcripts and never types into an agent on its own (a lint rule says so). The one exception is [compaction](#compaction), and only when you ask for it.

## Compaction

`tab-recap.compact` (bind it, e.g. `prefix+shift+c`; or `c` in the column or the modal):

1. A popup asks for an optional note (up to 280 characters). Enter on an empty note sends without it; Esc cancels.
2. The recap is refreshed. Then each target agent (`TAB_RECAP_COMPACT_TARGET`: `focused` by default,
   `all`, or kinds like `claude,codex`) that is **idle or done** gets a message written as your own
   instruction, in English, never naming the plugin, at most 3 000 characters. A **brief** writer (a
   model call, see [Models](#models)) reads the **whole session** — every distinct goal, decision, finished
   item, question, next step, rule and reference of the agent's tasks from the database, with when each first
   and last appeared, your note, the latest recap and the agent's last turns — and writes what the agent's own
   summary must keep, recall first: your note, the goal, decisions **with their reasons**, questions waiting for
   you, unfinished work with errors and failing tests, the standing rules you gave, and exact references; and
   to drop tool output, finished-step detail and resolved dead ends. A notification says it is being written.
   If the brief cannot be written (the job is `off`, no such CLI, a timeout, an answer that names the plugin),
   a template filled from the latest recap is used instead (references are trimmed first when it is too long;
   the note and the goal never), so compaction always happens.
3. **claude** gets `/compact ` typed, then the guidance typed, then Enter — in pieces, so it runs as a command
   at any length (a pasted block, or one long send, would be taken as a message and never compact).
   **codex** and **opencode** run their own `/compact`, then get one short message with the same points that
   asks only for "ok".

After the command is sent the agent is waited for until it is idle or done again, and its own records
(read-only) say what happened: Claude's `compact_boundary` row means it compacted; an `Error during
compaction` row (its own summarizer failed) means the same guidance is typed once more; Codex's `compacted`
row means it compacted, and only then does it get the restore message. A notification says the outcome:
compacted (on the second try), could not compact even after trying again, or could not confirm.

A working or blocked agent is skipped and a notification names it. Agents read from their screen and
`hermes` are not offered compaction.

**The hint.** A lane whose context use reaches `TAB_RECAP_COMPACT_HINT` percent (default 40; `off`, or
10–95) of its window shows `compact? 45% of 1M`. It never compacts by itself. The window is found at
runtime: Codex's own `model_context_window`; opencode's and Claude's model looked up in opencode's local
models.dev catalogue (`~/.cache/opencode/models.json`) when it exists; else, for Claude, a small family
table; raised when the tokens actually used prove it bigger. `TAB_RECAP_CONTEXT_WINDOW` overrides it.

## Models

Every model call is a **job** run on one harness (`claude`, `codex`, `opencode`, `hermes` or your own
command) with a model and an effort. The settings modal lists them under **Models**, one row per job showing
`harness · model · effort`; ←/→ pick a part, Enter edits it.

| job | harness | model | effort |
| --- | --- | --- | --- |
| recap writer | `TAB_RECAP_BACKEND` (`auto`) | `TAB_RECAP_MODEL_<HARNESS>` | `TAB_RECAP_EFFORT` (`low`) |
| compaction brief | `TAB_RECAP_COMPACT_BY` (`recap` = the recap writer's harness; or `auto`, a harness, `off` = template only) | `TAB_RECAP_COMPACT_MODEL` (empty = the harness's configured model) | `TAB_RECAP_COMPACT_EFFORT` (`high`) |

Efforts: `low` · `medium` · `high` · `default` (pass nothing). Every harness runs with no tools, no user
settings or MCP and no session left behind.

## Install

See the [quick start in the root README](../README.md#tab-recap): install, first run, everyday use
and troubleshooting. In short:

```bash
herdr plugin install crisap94/herdr-plugins/tab-recap     # or, from a checkout: herdr plugin link ./tab-recap
herdr plugin action invoke tab-recap.start                # on; stays on across herdr restarts
```

Needs herdr ≥ 0.9.0, Node ≥ 24.21.0 (runs the TypeScript directly, no build) and at least one of
`claude`, `codex`, `opencode`, `hermes` on PATH (or `TAB_RECAP_CUSTOM_CMD`). `glow` is used for
Markdown when installed. Colours follow the terminal: `NO_COLOR=1` (or `FORCE_COLOR=0`) in a column's or modal's environment turns them off.

## Actions

| action | does |
| --- | --- |
| `tab-recap.start` / `stop` / `toggle` | daemon on/off; off closes every column and stays off |
| `tab-recap.show` | the current tab's recap as a modal (what a tap on the bar does) |
| `tab-recap.refresh` | recap the current tab now |
| `tab-recap.column` | hide this tab's column, or show it again (recaps keep being written; remembered across restarts) |
| `tab-recap.columns` | hide every column, or show them all again |
| `tab-recap.compact` | compact the focused agent (`TAB_RECAP_COMPACT_TARGET`: `focused`, `all` or kinds like `claude,codex`): a popup asks for an optional note (Enter sends, Esc cancels); claude gets `/compact <what to keep>`, codex and opencode their own `/compact` and then one short message restoring where things stand |
| `tab-recap.configure` | the settings modal: agent, model, interface and recap language; `t` tests, `s` saves |
| `tab-recap.status` | the code's version, the Node running it, the keys bound to tab-recap actions, the daemon (pid and the version it started with), backend, extensions, state and config paths (the log is `daemon.log` in the state path) |

Any backend, from a checkout: `node bin/tab-recap.ts backend <auto|claude|codex|opencode|hermes|custom> [model]` (a model only for a named harness; `auto` picks the first of claude → codex → opencode → hermes found on PATH). `node bin/tab-recap.ts --help` (or `-h`) prints the commands; an option it does not know is refused with exit code 2.

In the column and the modal: `j`/`k` or arrows scroll, Space/`b` page, `g`/`G` top/bottom, `r` recaps now, `c` compacts the focused agent, `s` opens the settings, `h` hides this tab's column, Enter or a tap opens the modal, `q`/Esc closes the modal.

Bind one in `~/.config/herdr/config.toml`, e.g.:

```toml
[[keys.command]]
key = "prefix+r"
type = "plugin_action"
command = "tab-recap.column"      # hide / show this tab's column

[[keys.command]]
key = "prefix+shift+s"
type = "plugin_action"
command = "tab-recap.configure"   # the settings modal, from anywhere

[[keys.command]]
key = "prefix+shift+r"
type = "plugin_action"
command = "tab-recap.columns"     # hide / show every column

[[keys.command]]
key = "prefix+shift+c"
type = "plugin_action"
command = "tab-recap.compact"     # ask what to keep, then compact the focused agent
```

`prefix+c` is herdr's own "new tab" key; pick free keys. `herdr server reload-config` applies them.

A hidden column is closed and not reopened, and recaps are still written — showing it again is instant.

### macOS

If `prefix+r` does nothing, run `tab-recap.status` first: it prints the Node that runs the plugin and which keys herdr has bound to a `tab-recap.*` action (or `no key bound — see README`).

- **No key is bound out of the box.** Add the bindings above to your config; on macOS it is `~/.config/herdr/config.toml` too (not `~/Library/Application Support`), or `$HERDR_CONFIG_PATH`. Then `herdr server reload-config`; `prefix+?` lists the active keys.
- **The default prefix is `ctrl+b`**: press it, release, then `r`. A custom `[keys] prefix` changes that.
- **Node ≥ 24.21.0 must be on the PATH of herdr's *server*,** not just of your shell. Homebrew (`/opt/homebrew/bin`) and nvm/fnm/mise shims are often only on an interactive shell's PATH, so an action fails with `node: not found` or runs an older system node (it cannot run `.ts`). Fix: install Node 24.21+ (`brew install node`, or `mise use -g node@24` / `nvm install 24`), `herdr server stop`, open a new terminal where `node --version` is ≥ 24.21, and start `herdr` from it. If herdr is started from a launcher: `launchctl setenv PATH "/opt/homebrew/bin:$PATH"` and restart it.
  With an older Node the plugin says so instead of failing silently: the column, the settings and the compaction popup show the version found, the one required, the path of the `node` used and the steps **for your OS** (macOS: Homebrew and `launchctl`; Linux: nvm, mise or n); a command prints them and exits 1; the daemon writes one dated line to `daemon.log`. `tab-recap.status` reports it and goes on. A Node too old to run `.ts` prints the same message in English.
- **Prefer `ctrl+alt` over plain `alt`:** macOS composes `alt+key` into special characters; `key = "ctrl+alt+r"` is safe and needs no prefix.

Read-only diagnosis (run the last two inside a herdr pane):

```bash
herdr --version; herdr plugin list | grep -i tab-recap
herdr plugin action list | grep tab-recap.column || echo "missing: update the plugin (>= 1.1.0)"
CFG="${HERDR_CONFIG_PATH:-$HOME/.config/herdr/config.toml}"; grep -n -B2 -A3 'tab-recap' "$CFG" || echo "no tab-recap binding in $CFG"
command -v node; node --version
SP=$(pgrep -f 'herdr.*server' | head -1); ps eww -p "$SP" | tr ' ' '\n' | grep '^PATH='     # the server's PATH
herdr plugin action invoke tab-recap.status
herdr plugin log list --plugin tab-recap | tail -30
```

## Configure

`config.env` in `herdr plugin config-dir tab-recap` — see [`config.example.env`](config.example.env).
Environment variables win over the file; it is re-read on every recap (keys marked *restart* in the example excepted). The one to know: **`TAB_RECAP_MIN_TAB_COLS=110`** — narrower tabs (a phone client) get a bar instead of a side column.

## State and rolling back

The plugin keeps what it knows in one SQLite file, `tab-recap.db`, in its state directory (the path `tab-recap.status` prints;
it must be on a local disk — WAL does not work on network filesystems). Process files stay files: `daemon.pid`, `daemon.beat`,
`daemon.version`, `daemon.log`, `disabled` and `summarizer/`.

**From 1.6.0 on** the first daemon that starts moves the old JSON files (`recaps/`, `tabs/`, `requests/`, `visibility/`,
`hidden.json`) into the database in one transaction, checks every tab reads back identically, and only then moves the files to
`legacy-files-<timestamp>/` in the state directory. They are never deleted. Before you upgrade you can see what would happen,
touching nothing: `cp -r <state dir> /tmp/state-copy && node src/adapters/db/import/dry-run.ts /tmp/state-copy`.

**Back to 1.5.1:** `tab-recap.stop` (stop the daemon), move the contents of `legacy-files-<timestamp>/` back into the state
directory, check out 1.5.1, start it. The 1.5.1 daemon ignores `tab-recap.db`; recaps written since the upgrade are not carried
back. Upgrading to 1.6.0 again later starts from the database as it was: delete `tab-recap.db*` first to import the files again.

Schema versions so far: **1** (1.6.0, the import), **2** (1.7.0, each lane's web address for links),
**3** (1.8.0, standing rules, compaction requests and context use).
An upgrade of the database itself first copies it to `tab-recap.db.v<n>.bak` (the newest three are kept). If a database was
written by a **newer** plugin than the one running, it is opened read-only and left alone: the daemon shows a notification and
stops, the columns say so instead of a recap — upgrade the plugin, or restore the backup the message names.

## Develop

See [`CLAUDE.md`](CLAUDE.md) (layers and red lines) and [`CONTEXT.md`](CONTEXT.md) (vocabulary).
