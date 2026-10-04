# herdr-plugins

Plugins for [herdr](https://github.com/ogulcancelik/herdr), the terminal multiplexer for coding
agents. One plugin per directory, each installable on its own.

## Plugins

| plugin | what it does | docs |
| --- | --- | --- |
| **tab-recap** | a recap column beside every tab with a coding agent | [below](#tab-recap) · [folder](tab-recap) |

## tab-recap

A **recap column** pinned to the right of every herdr tab that has a coding agent in it. It keeps a
rolling, structured recap of the conversation (goal, what is happening now, what waits on you, what
is done, decisions, next steps), so a long session never loses its thread. A coding agent of your
choice writes it at the end of each turn. It only reads transcripts; it never types into an agent.

```text
 Payments API migration
 ● idle · claude · recap 2m ago
 › keep the old endpoint until Friday

 GOAL
 • Move checkout to the v2 API…
 NOW / WAITING ON YOU / DONE /
 DECISIONS / NEXT / KEY REFS
```

On a phone (a narrow tab) you get a one-row **bar** along the top instead: a status dot per agent
and one headline. Tap it to open the full recap.

### Requirements

- herdr ≥ 0.9.0 (Linux or macOS)
- Node ≥ 24 (runs the TypeScript directly, nothing to build)
- at least one coding agent on your `PATH`: `claude`, `codex`, `opencode` or `hermes` (or your own
  command, see [Who writes the recap](#who-writes-the-recap))
- optional: [`glow`](https://github.com/charmbracelet/glow), for nicer Markdown

### Install

```bash
herdr plugin install crisap94/herdr-plugins/tab-recap
herdr plugin action invoke tab-recap.start
```

`start` turns it on, and it stays on across herdr restarts. Working from a checkout? Use
`herdr plugin link ./tab-recap` instead of `install`.

### First run

Open a tab with a `claude` or `codex` agent. Within a moment a narrow column appears on the right;
it fills in when the agent finishes its first turn (or press `r` in the column to write it now).

Open the settings:

```bash
herdr plugin action invoke tab-recap.configure
```

Pick the agent and model, the recap length and the languages. Press **`t`** to run a test with the
current choices (it shows ✓ and how long it took, or why it failed), **`s`** to save, **`q`** to
close. Changes apply to the next recap.

To open the settings with a key, add this to `~/.config/herdr/config.toml`:

```toml
[[keys.command]]
key = "prefix+r"
type = "plugin_action"
command = "tab-recap.configure"
```

Use any free key, and `tab-recap.refresh` instead if you would rather bind "recap this tab now".

### Everyday use

- **Column** (wide tabs): the recap, always visible. By default it appears for `claude` and
  `codex` agents.
- **Bar** (tabs narrower than 110 cells, like a phone): one row along the top.
- **Tap** the bar or the column, or press **Enter** in the column, to open the full recap as a
  modal over everything. **`q`** or **Esc** closes it.
- In the column or the modal: **`j`/`k`** or the arrow keys scroll, **Space**/**`b`** page down/up,
  **`g`**/**`G`** jump to top/bottom, **`r`** writes a new recap now.
- Recaps are written at the end of each turn, when you focus a tab whose recap is stale, and on
  `r`.
- One recap per tab, covering all its agents.

The same views are available as actions: `tab-recap.show` (the modal) and `tab-recap.refresh`
(recap this tab now).

### Who writes the recap

By default (`auto`) the first agent found on your `PATH` writes it, in this order: `claude`,
`codex`, `opencode`, `hermes`. To choose, use the settings modal (`tab-recap.configure`), or from a checkout:

```bash
node bin/tab-recap.ts backend codex gpt-6-luna   # an agent and, optionally, a model
node bin/tab-recap.ts backend auto               # back to the default
```

Each agent remembers its own model; leave it empty
for the agent's default. `opencode` wants `provider/model`.

**Your own command:** set `TAB_RECAP_BACKEND=custom` and `TAB_RECAP_CUSTOM_CMD` to a command line
(no shell) that reads the prompt on stdin and prints the recap's Markdown on stdout.

### Languages

- **Interface** (column, footer, messages): `en` or `es`, or `auto` to follow your locale.
  `TAB_RECAP_LOCALE`
- **Recap language**: `ui` (same as the interface), `en`, `es`, or any language name such as
  `Português`. Changing it rewrites the recap at once. `TAB_RECAP_RECAP_LANG`

### Settings

Everything lives in a `config.env` file of `KEY=VALUE` lines. Find the folder with:

```bash
herdr plugin config-dir tab-recap
```

Copy [`config.example.env`](tab-recap/config.example.env) there and edit. It is re-read on every
recap, so no restart is needed (except for the keys marked *restart* in the example). Environment
variables win over the file. The ones people change:

| key | default | what it does |
| --- | --- | --- |
| `TAB_RECAP_BACKEND` | `auto` | who writes the recap |
| `TAB_RECAP_WORDS` | `450` | target recap length |
| `TAB_RECAP_WIDTH` | `0.3` | column width as a share of the tab |
| `TAB_RECAP_MIN_TAB_COLS` | `110` | narrower tabs get a bar (*restart*) |
| `TAB_RECAP_AGENTS` | `claude,codex` | agent kinds that get a column (*restart*) |
| `TAB_RECAP_LOCALE` | `auto` | interface language |
| `TAB_RECAP_RECAP_LANG` | `ui` | recap language |

### Troubleshooting

Start with:

```bash
herdr plugin action invoke tab-recap.status
```

It prints whether the daemon runs, which agent writes recaps, and the state and config folders. The
daemon log is `daemon.log` in that state folder (by default
`~/.local/state/herdr/plugins/tab-recap/`).

- **"No recap writer found"**: no agent was found on your `PATH`. Install `claude`, `codex`,
  `opencode` or `hermes`, or set `TAB_RECAP_BACKEND` and `TAB_RECAP_CUSTOM_CMD`.
- **No column appears**: the tab needs an agent of a kind in `TAB_RECAP_AGENTS` (default `claude`
  and `codex`), and the daemon must be on (`tab-recap.start`).
- **The column keeps closing**: if you close it, the daemon reopens it, but at most 3 times in 2
  minutes. After that it leaves you alone for 10 minutes. To turn it off for good, run
  `tab-recap.stop`.
- **Turn it off**: `herdr plugin action invoke tab-recap.stop` closes every column and stays off
  until you run `tab-recap.start` again.

The full reference (all actions, the extension point, the design) is in
[`tab-recap/README.md`](tab-recap/README.md).

## Contributing

Issues and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, the checks
to run and how pull requests flow.

## Changelog

Release notes are in [CHANGELOG.md](CHANGELOG.md).

## License

[MIT](LICENSE) © 2026 crisap94
