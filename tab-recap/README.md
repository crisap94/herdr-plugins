# Tab Recap

A **recap column** pinned to the right of every herdr tab that has a coding agent in it. It keeps
a rolling, structured recap of the conversation, so a long session never loses its thread:

```text
 Payments API migration
 ● idle · claude · recap 2m ago
 ⚑ idle 12m ago · feat/x · 7 unmerged · dirty
 › keep the old endpoint until Friday

 GOAL
 • Move checkout to the v2 API…
 NOW / WAITING ON YOU / DONE / DECISIONS / NEXT / KEY REFS
```

- **On a phone, a bar.** A narrow tab gets a one-row bar along the top instead — a status dot
  per agent and one headline (what needs you, else what is happening now). **Tap it** (or tap the
  column on a desktop) and the full recap opens as a modal over everything; `q` closes it.
- **Per tab, by default.** A daemon opens the column in every tab with an agent of a kind in
  `TAB_RECAP_AGENTS` (default `claude` and `codex`), the moment the agent appears, keeps it narrow, and reopens it if it is closed (up to
  3 times in 2 minutes — then it respects you for 10 minutes, `TAB_RECAP_GIVE_UP_MS`).
- **One recap per tab, from all its panes.** Every agent in the tab gets a short header (title,
  status, extension notes, last prompt); below them, ONE recap covers the tab's work as a whole.
- **Written at the end of each turn** by any harness — `claude`, `codex`, `opencode`, `hermes` (the
  first one found, or the one you pick), or your own command —
  from the previous recap plus only the new part of every agent's transcript. Also on tab focus when
  stale, and on `r` in the column or the modal. `hermes` runs in safe mode with only its `clarify` tool
  (it cannot run with zero tools; `clarify` cannot touch files, a shell or the network).
- **Extensible.** An optional extension can add notes under a lane's header and do housekeeping
  on the daemon's tick (see `src/extensions/` and `CONTEXT.md`); none are loaded by default.
- **English or Spanish.** The column and the commands speak `en` or `es` (`TAB_RECAP_LOCALE`), and the recap can be
  written in either or in any language you name (`TAB_RECAP_RECAP_LANG`); switching rewrites it at once.
- **Read-only.** It reads transcripts; it never types into an agent (a lint rule says so).

## Install

See the [quick start in the root README](../README.md#tab-recap): install, first run, everyday use
and troubleshooting. In short:

```bash
herdr plugin install crisap94/herdr-plugins/tab-recap     # or, from a checkout: herdr plugin link ./tab-recap
herdr plugin action invoke tab-recap.start                # on; stays on across herdr restarts
```

Needs herdr ≥ 0.9.0, Node ≥ 24 (runs the TypeScript directly, no build) and at least one of
`claude`, `codex`, `opencode`, `hermes` on PATH (or `TAB_RECAP_CUSTOM_CMD`). `glow` is used for
Markdown when installed.

## Actions

| action | does |
| --- | --- |
| `tab-recap.start` / `stop` / `toggle` | daemon on/off; off closes every column and stays off |
| `tab-recap.show` | the current tab's recap as a modal (what a tap on the bar does) |
| `tab-recap.refresh` | recap the current tab now |
| `tab-recap.configure` | the settings modal: agent, model, length, interface and recap language; `t` tests, `s` saves |
| `tab-recap.status` | daemon, backend, extensions, state and config paths (the log is `daemon.log` in the state path) |

Any backend, from a checkout: `node bin/tab-recap.ts backend <auto|claude|codex|opencode|hermes|custom> [model]` (a model only for a named harness; `auto` picks the first of claude → codex → opencode → hermes found on PATH).

In the column and the modal: `j`/`k` or arrows scroll, Space/`b` page, `g`/`G` top/bottom, `r` recaps now, Enter or a tap opens the modal, `q`/Esc closes the modal.

Bind one in `~/.config/herdr/config.toml`, e.g.:

```toml
[[keys.command]]
key = "prefix+r"
type = "plugin_action"
command = "tab-recap.refresh"
```

## Configure

`config.env` in `herdr plugin config-dir tab-recap` — see [`config.example.env`](config.example.env).
Environment variables win over the file; it is re-read on every recap (keys marked *restart* in the example excepted). The one to know: **`TAB_RECAP_MIN_TAB_COLS=110`** — narrower tabs (a phone client) get a bar instead of a side column.

## Develop

See [`CLAUDE.md`](CLAUDE.md) (layers and red lines) and [`CONTEXT.md`](CONTEXT.md) (vocabulary).
