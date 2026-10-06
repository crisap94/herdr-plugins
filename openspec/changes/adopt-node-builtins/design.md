# Design

## Context

See proposal.md (Why). The renderer (`src/recap/render/`) is pure: it builds strings and never touches a
stream, and its golden tests compare exact output, escape sequences included. The column, modal and
setup screens are long-running processes whose stdout is the herdr pane's terminal. Measured on
Node 24.21: `visibleLength('📝✅')` returns 2 while the terminal draws 4 cells; `wrap()` splits a
surrogate pair when it cuts a long word.

## Goals / Non-Goals

**Goals:**
- One width function used by every layout path, correct for ANSI escapes, emoji, ZWJ sequences and
  combining accents.
- Rendering stays pure and deterministic in tests; the colour decision is made once, at a process's
  composition root.
- Same visible output as today except where today's output is wrong.

**Non-Goals:**
- East Asian wide characters (CJK) — no Node built-in reports East Asian Width.
- Any change to recap content, prompts, storage or the herdr protocol.

## Decisions

1. **Width = grapheme clusters of the escape-free text, 2 cells for emoji presentation.**
   `util.stripVTControlCharacters` removes escapes; `Intl.Segmenter(undefined, {granularity: 'grapheme'})`
   splits clusters; a cluster counts 2 when it matches `\p{Extended_Pictographic}` with emoji
   presentation (`\p{Emoji_Presentation}` or a VS16 `️`), 0 when it is only combining marks,
   else 1. Alternative: keep the hand-written escape scanner and add surrogate checks — rejected, it
   still miscounts ZWJ sequences and stays our code.
2. **Cutting a long word walks graphemes**, accumulating cell width, never `String.slice` by index.
3. **Colours via `util.styleText(format, text, { validateStream: false })`** inside the pure renderer,
   so output is identical with or without a TTY (tests stay deterministic). Whether colours are used at
   all is decided at the composition root with `process.stdout.hasColors()` (honours `NO_COLOR`,
   `FORCE_COLOR`, `NODE_DISABLE_COLORS`) and passed in as a plain style table (coloured or identity).
   Alternative: `validateStream: true` — rejected, it ties pure rendering to the process's stdout.
4. **Socket framing with `readline.createInterface({ input: socket, crlfDelay: Infinity })`**; a line
   that is not a JSON object is ignored exactly as today. Alternative: keep the buffer loop — rejected,
   built-in framing handles chunk boundaries and UTF-8 splits for us.
5. **`util.parseArgs({ allowPositionals: true, strict: true, options: { help: { type: 'boolean',
   short: 'h' } } })`**; positionals keep today's meaning (`<command> [arg] [model]`). A parse error is
   the existing usage error (exit code 2).
6. **`Intl.RelativeTimeFormat(locale, { style: 'narrow', numeric: 'always' })`** for the operator UI
   locales en and es, formatting `-amount` (negative zero for 0 so it reads "0s ago", not "in 0s").
   Verified outputs: en `12s ago · 5m ago · 3h ago · 2d ago`, es `hace 12 s · hace 5 min · hace 3 h ·
   hace 2 d` — identical to today's strings. The unit choice (`elapsed()`) stays ours.
7. **`setTimeout` from `node:timers/promises`** for the summarizer's re-list delay.

Kept hand-written, and why: `parseEnv` (util.parseEnv expands escapes and multi-line values
differently; the file is written by our setup screen in our own format), the process-group kill in
`adapters/run.ts` (spawn's `timeout` kills only the direct child), the version line match (no TOML
parser in Node).

## Risks / Trade-offs

- [Golden outputs with emoji change width] → expected: they were wrong; update them and add explicit
  emoji/ZWJ/accent cases.
- [A terminal or font that draws an emoji one cell wide] → the cell rule follows Unicode emoji
  presentation, which modern terminals follow; documented in CONTEXT.md under the width noun.
- [`hasColors()` false in a herdr pane that does support colour] → herdr panes are TTYs with `TERM`
  set; verify live in a column before release; `FORCE_COLOR=1` overrides.
- [readline changes when a partial last line is delivered] → the socket is long-lived; a test feeds a
  message split across chunks and a multi-byte character split across chunks.

## Migration Plan

Ships as a patch release after tab-recap 1.6.0, through the usual merge request → release flow. No state
or config change; rollback is the previous release.
