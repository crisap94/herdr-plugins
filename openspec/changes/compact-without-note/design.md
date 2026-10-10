# Design

## 1. One decision for both entry points

`startCompact` (`src/recap/application/compact-start.ts`) takes the tab, the pane, the `--note` text (or
`undefined` when there is none), the setting and two effects: `askNote` (the popup) and `queue` (the request).
The CLI (`bin/tab-recap.ts`, `compact`) and the column (`src/column/main.ts`, `c` outside the modal) both call it,
so the rule lives in one place and is tested with fakes.

The rule is: a `--note` queues at once with that note; otherwise `ask` opens the popup and `skip` queues with no
note. The popup is the only path that asks the operator, so `skip` and `--note` never open it.

## 2. The setting is a domain value, read on every use

`src/recap/domain/compact-note.ts` holds `CompactNote = 'ask' | 'skip'` and `compactNoteOf`, which takes anything
other than `skip` (ignoring case and spaces) as `ask`, so an invalid value keeps today's behaviour. The config
reads it per call (`loadConfig().compactNote`), like the other settings, so no restart is needed. The settings
row follows the pattern of `TAB_RECAP_HERDR_EVENTS`: a choice field, a lock on the variable, and a write of the
variable when the row changes.

## 3. `--note` is an option of `compact` only

`parseArguments` (already `node:util` `parseArgs`, strict) gains a `note` string option. `--note` on any other
command is a usage error (exit 2), and `--note` without a value is the `parseArgs` usage error. The text goes
through `requestNoteOf`, the popup's own `noteOf` (one line, trimmed, blank is no note) and the popup's
280-character limit, so a note from the command line is kept exactly as a typed one is.

## 4. No new dependency

Node's `parseArgs` already parses the CLI, and `startCompact` is plain TypeScript over the existing request port.
Nothing new is added to `package.json`.

## 5. Failures stay honest

- `ask`, the popup does not open: the existing message, "the modal did not open".
- `skip` or `--note`, the request cannot be queued (the state store is not ready): "the compaction was not
  requested", with the reason. The database message is printed by the existing store check.

## 6. Docs and screenshots

The settings modal gains a row, so `docs/screens/setup-en.png` and `setup-es.png` are regenerated with
`docs/screens/shoot.mjs`. Those two images are the only images in this change.
