# Design

## Context

See proposal.md. The reviewed plan with all measurements is summarised here; the DTD itself lives in
`tab-recap/schema/recap-input.dtd` (created by MR 2) and is quoted in full in decision 2.

## Goals / Non-Goals

**Goals:** the writer gets times, orientation, the agent's own notes, readable tool use and whole
conclusions, inside an unambiguous structure; a typical turn's input is no bigger than today's; the
writer runs at low effort; zero runtime dependencies.

**Non-Goals:** parsing XML (we only generate it); sending the DTD to the model; changing the answer.

## Decisions

1. **No XML library; our own serializer.** Node core has no XML parser or serializer (`DOMParser` /
   `XMLSerializer` undefined on 24.15–24.21; no `node:` module), and npm packages are runtime
   dependencies. We only generate, so a pure `src/recap/application/xml.ts` is enough: characters
   outside XML 1.0 `Char` removed (terminal escapes via `util.stripVTControlCharacters` first), text
   with `<` or `&` in one CDATA section (`]]>` split as `]]]]><![CDATA[>`), attributes double-quoted
   with `&` `<` `"` escaped and whitespace folded. No `<?xml?>` and no `<!DOCTYPE>` in the prompt.
2. **The document is defined by a DTD**, validated in tests with `xmllint --noout --dtdvalid`
   (libxml2; present on GitHub ubuntu/macOS runners, installed in GitLab test jobs; `xmllint-wasm` only
   documents XSD/RelaxNG). Root `recap_input` (version 1) = `tab` (`agent`+ with `file`*), optional
   `current_tasks` (2+ agents), `previous_recap` (format json|markdown|none), `agent_note`*,
   `transcript`+ (of `turn` and `tools`/`call`), optional `correction`. Agents carry XML `ID`s that
   tasks, notes and transcripts reference with `IDREF(S)`, so a dangling reference fails validation.
   Times: `tab@now` UTC ISO 8601, `tab@zone` IANA; everything else `HH:MM` in that zone (date added
   when not today).
3. **Data first, instructions after** on stdin (codex, opencode, custom); claude keeps instructions in
   `--system-prompt`; hermes (argv) drops whole oldest turns to fit, never cutting markup.
4. **Tool calls are structured at the reader**, not flattened to a brief: `{kind: shell|edit|web|agent|
   other, text, what?}`; Codex `exec` JavaScript is decoded (`exec_command({cmd})`, apply_patch file
   headers); plain reads are counted; `lane-hints` reads edits by kind, so Codex edits are seen.
5. **Clipping keeps head and tail** (agent 700 + 1 800 chars, user 1 500 + 500).
6. **Effort setting** `TAB_RECAP_EFFORT` (`low` default, `medium`, `high`, `default` = pass nothing),
   mapped per CLI (codex `-c model_reasoning_effort`, claude `--effort`, opencode `--variant`, hermes
   `--reasoning`); a mapping ships only if a probe with the installed CLI and its default model
   succeeds. Codex additionally runs with unused features disabled, each probe-verified.
7. **Node floor 24.21.0** (the newest 24.x, operator's choice): node:sqlite prints no warning since
   24.15, so the `--disable-warning=ExperimentalWarning` flag is removed everywhere.

## Risks / Trade-offs

- [CDATA/tag overhead adds tokens] → leaving out plain reads and folding tools more than pays for it;
  measured before/after on the same request.
- [A CLI rejects an effort or feature flag after an update] → probe-verified mappings; a writer failure
  is reported as today (sum-typed `Unknown`), and `TAB_RECAP_EFFORT=default` passes nothing.
- [Users on Node < 24.21] → the host check says exactly what to install; CHANGELOG names the minimum.
- [Model treats agent notes as facts] → instructions: the transcript wins; notes are marked as the
  agent's own words.

## Migration Plan

Two releases through the usual MR → `release:prepare` flow. No state migration. Rollback: the previous
release (it reads the same database).
