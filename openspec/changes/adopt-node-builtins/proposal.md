# Proposal

## Why

tab-recap re-implements several things Node already ships, and one of them is wrong: the column's text
layout counts code points instead of terminal cells and cuts long words with `String.slice`. An emoji
(📝, ✅) is drawn two cells wide but counted as one, so lines overflow the column, and a cut can split a
surrogate pair, printing a broken character on each side (`"xxxxxxx\ud83d"`, `"\udcdd📝📝"`). Moving the
hand-written pieces to Node built-ins fixes this and removes code we would otherwise keep maintaining.

## What Changes

- Text layout measures width in terminal cells and wraps on grapheme boundaries: escape sequences take
  no cells, emoji take two, a cut never splits a character (Intl.Segmenter,
  util.stripVTControlCharacters).
- Escape-sequence stripping in the setup modal and the glow adapter uses util.stripVTControlCharacters
  instead of hand-written regular expressions and parsers.
- Colours are produced with util.styleText; a column, modal or setup screen prints no colour when the
  terminal asks for none (`NO_COLOR`, `FORCE_COLOR=0`, `NODE_DISABLE_COLORS`), decided by the
  terminal stream's `hasColors()`.
- The herdr socket is framed into JSON lines with node:readline instead of a hand-written buffer.
- The command-line entry parses its arguments with util.parseArgs: `--help` prints usage, an unknown
  option is a usage error.
- The opencode summarizer waits with `setTimeout` from node:timers/promises.
- "How long ago" texts come from Intl.RelativeTimeFormat (narrow style) for English and Spanish, with
  the same output as today (`5m ago`, `hace 5 min`).

Out of scope: East Asian wide characters (no built-in reports their width; the plugin's UI languages are
English and Spanish), replacing `parseEnv` with util.parseEnv (different quoting rules could change
existing `config.env` values), the process-group kill in the command runner (Node's spawn timeout only
kills the direct child), TOML parsing (Node has none; the one-line version match stays).

Merge request label: `changelog::fixed` (the overflow and broken-character bug is the user-visible part).

## Capabilities

### New Capabilities

- `tab-recap/text-layout`: how recap text is measured, wrapped and coloured for a narrow terminal pane.
- `tab-recap/relative-time`: how elapsed time is shown in the operator's language.
- `tab-recap/cli`: how the command-line entry accepts commands, help and options.

### Modified Capabilities

_None (no specs exist yet)._

## Impact

- Code: `tab-recap/src/recap/render/wrap.ts`, `tab-recap/src/recap/render/present.ts` (styles),
  `tab-recap/src/setup/main.ts`, `tab-recap/src/adapters/glow.ts`, `tab-recap/src/transport/herdr.ts`,
  `tab-recap/bin/tab-recap.ts`, `tab-recap/src/adapters/opencode-summarizer.ts`, `tab-recap/src/i18n/*`,
  the column and setup composition roots (colour decision).
- Tests: golden render outputs that contain emoji change (now correctly two cells wide).
- Dependencies: none added. Requires the Node >= 24.14.0 floor introduced by the SQLite state change
  (tab-recap 1.6.0); this change is cut from `main` after that lands.
