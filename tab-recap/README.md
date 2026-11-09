# Tab Recap

[![ci](https://github.com/crisap94/herdr-plugins/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/crisap94/herdr-plugins/actions/workflows/ci.yml)

A recap column beside every [herdr](https://github.com/ogulcancelik/herdr) tab with a coding agent: the goal,
what is happening now and what needs you, kept as a ledger of facts so a long session keeps its thread.

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

- **A column per tab.** A tab with an agent of a kind in `TAB_RECAP_AGENTS` gets a column beside it.
- **A bar on a narrow tab.** A tab narrower than `TAB_RECAP_MIN_TAB_COLS` columns gets a one-row bar along the top.
- **A ledger of facts.** The recap lists the facts of each task, with their time and, for a decision, its reason.
- **Your agent writes it.** `claude`, `codex`, `opencode` or `hermes` writes the recap, or your own command does.
- **Clickable references.** Merge requests, pull requests, issues, commits, branches and files open on Ctrl-click.

## Contents

- [Requirements](#requirements)
- [Install](#install)
- [First use](#first-use)
- [Commands and keys](#commands-and-keys)
- [Configuration](#configuration)
- [Documentation](#documentation)
- [Troubleshooting](#troubleshooting)
- [Support](#support)
- [Contributing](#contributing)
- [Security](#security)
- [License](#license)

## Requirements

- herdr 0.9.0 or newer.
- Bun on the PATH of herdr's server, not only of your shell: the plugin's commands start with `bun`.
  Bun 1.4.4 or newer. The [platform notes](docs/REFERENCE.md#platform-notes) show how to fix a missing PATH.
- Linux or macOS.
- At least one agent on the PATH: `claude`, `codex`, `opencode` or `hermes`, or your own command
  (`TAB_RECAP_CUSTOM_CMD`).

## Install

```bash
herdr plugin install crisap94/herdr-plugins/tab-recap   # from a checkout: herdr plugin link ./tab-recap
herdr plugin action invoke tab-recap.start               # turn the daemon on
```

The install runs `bun install --frozen-lockfile --production` (the `[[build]]` step of `herdr-plugin.toml`).
Bun is the only runtime.

To turn the plugin off, run `herdr plugin action invoke tab-recap.stop`. It closes every column and stays off until
you start it again. To remove the plugin, run `herdr plugin uninstall tab-recap`.

## First use

Open a tab with a `claude` or `codex` agent. A column appears beside it. The recap fills in when the agent finishes a
turn; press `r` in the column to write it now.

Check the plugin at any time:

```bash
herdr plugin action invoke tab-recap.status
```

It prints one line per item:

```text
version     <plugin version>
bun         <path to bun> <bun version>
keys        <key> → tab-recap.<action>, …
daemon      pid <pid> v<daemon version>
backend     <agent>/<model>
extensions  stored-notes
state       <state folder>
config      <config.env path>
```

The state folder is `~/.local/state/herdr/plugins/tab-recap/` by default. The daemon log is `daemon.log` in it.
The [guide](GUIDE.md) walks through everyday use.

## Commands and keys

Every command is a herdr plugin action, run with `herdr plugin action invoke tab-recap.<action>`:

| action | what it does |
| --- | --- |
| `start`, `stop`, `toggle` | turn the daemon on or off; off closes every column and stays off |
| `show` | the current tab's expanded view, as a modal |
| `refresh` | recap the current tab now |
| `column` | hide this tab's column, or show it again |
| `columns` | hide every column, or show them all again |
| `compact` | compact the focused agent (`TAB_RECAP_COMPACT_TARGET` picks the agents) |
| `configure` | the settings modal: agent, model, interface and recap language |
| `status` | the versions, the bound keys, the daemon, the backend, and the state and config paths |

Bind actions to keys in `~/.config/herdr/config.toml`, then run `herdr server reload-config`:

```toml
[[keys.command]]
key = "prefix+r"
type = "plugin_action"
command = "tab-recap.column"
```

The [guide](GUIDE.md#everyday-use) lists the bindings and the keys inside the column: `j`/`k` or the arrows scroll, `r`
recaps now, `c` compacts, `s` opens the settings, `h` hides the column, Enter opens the expanded view, and `q` or Esc
closes it.

From a checkout, the same commands run through `bun bin/tab-recap.ts <command>`. `bun bin/tab-recap.ts --help` lists
them. An unknown option exits with code 2.

Exit codes: `0` the command did what was asked, `1` it failed, `2` a usage error, `3` the request is outside what the
command covers.

## Configuration

Settings live in `config.env` in the plugin's config folder, printed by `herdr plugin config-dir tab-recap`
(by default `~/.config/herdr/plugins/config/tab-recap/config.env`). [`config.example.env`](config.example.env) lists
every setting with its default.

Environment variables win over the file. The file is re-read on every recap. Settings marked *(restart)* in the
example take effect after the daemon restarts.

| setting | default | what it does |
| --- | --- | --- |
| `TAB_RECAP_AGENTS` | `claude,codex,opencode` | agent kinds that get a column (restart) |
| `TAB_RECAP_BACKEND` | `auto` | the agent that writes the recap: `auto`, `claude`, `codex`, `opencode`, `hermes`, or `custom` |
| `TAB_RECAP_CUSTOM_CMD` | empty | your own writer command, used with `TAB_RECAP_BACKEND=custom` |
| `TAB_RECAP_LOCALE` | `auto` | the language of the column and the messages |
| `TAB_RECAP_RECAP_LANG` | `ui` | the language the recap is written in; `ui` follows the interface |
| `TAB_RECAP_EFFORT` | `medium` | the effort of the recap writer |
| `TAB_RECAP_COMPACT_TARGET` | `focused` | which agents `compact` reaches: `focused`, `all`, or kinds such as `claude,codex` |
| `TAB_RECAP_MIN_TAB_COLS` | `110` | tabs narrower than this get the bar instead of a column (restart) |
| `TAB_RECAP_KEEP_DAYS` | `30` | days a closed tab's history is kept; `0` keeps everything |

The models, compaction, handoff, autocompact and telemetry settings are in
[`config.example.env`](config.example.env) and in the [configuration reference](docs/REFERENCE.md#configuration-reference).

## Documentation

- [GUIDE.md](GUIDE.md): install, first run, everyday use and troubleshooting.
- [docs/REFERENCE.md](docs/REFERENCE.md): how the recap is kept, the expanded view, compaction, handoff, autocompact,
  the models, the desktop app, the other tools, the settings and the state.
- [CONTEXT.md](CONTEXT.md): the vocabulary the code uses.
- [../desktop/README.md](../desktop/README.md): the desktop mod for the herdr app.
- [ROADMAP.md](ROADMAP.md): what has shipped and what is planned.

## Troubleshooting

Start with `herdr plugin action invoke tab-recap.status`. The [guide's troubleshooting section](GUIDE.md#troubleshooting)
has more.

- **"No recap writer found"**: no agent was found on your `PATH`. Install `claude`, `codex`, `opencode` or `hermes`,
  or set `TAB_RECAP_BACKEND` and `TAB_RECAP_CUSTOM_CMD`.
- **No column appears**: the tab needs an agent of a kind in `TAB_RECAP_AGENTS`, and the daemon must be on
  (`tab-recap.start`).
- **The column keeps closing**: the daemon reopens a column you close, at most 3 times in 2 minutes. After that it
  leaves the column closed for 10 minutes. To hide a column for good, use `tab-recap.column`.
- **A link does not open**: hold Ctrl while clicking. Your terminal must pass the modified click to herdr.
- **Anything else**: `daemon.log` in the state folder records the daemon's runs and errors.

## Support

Ask questions and report bugs in [GitHub issues](https://github.com/crisap94/herdr-plugins/issues/new/choose).
See [SUPPORT.md](../SUPPORT.md).

## Contributing

[CONTRIBUTING.md](CONTRIBUTING.md) covers the setup and the gates: `bash ci/lint.sh` and `bash ci/test.sh`, run in this
folder. The rules shared by every plugin are in [../CONTRIBUTING.md](../CONTRIBUTING.md).

## Security

Report a vulnerability privately, not as a public issue. See [SECURITY.md](../SECURITY.md).

## License

[MIT](../LICENSE).
