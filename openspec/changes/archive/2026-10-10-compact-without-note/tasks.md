# Tasks

Paths are under `tab-recap/`, and every group ends with `bash ci/lint.sh` and `bash ci/test.sh` passing.

## 1. Vocabulary

- [x] 1.1 `CONTEXT.md`: add **Compact note** (the setting and `--note`); update **Compaction** and **Focus note**
  to say when the popup does not open. Verify: the `recap-vocabulary` lint passes (`bash ci/lint.sh`).

## 2. The setting (design decision 2)

- [x] 2.1 `domain/compact-note.ts` (`CompactNote`, `compactNoteOf`: `skip` is the only other value, `ask` by default);
  `Config.compactNote` read from `TAB_RECAP_COMPACT_NOTE`. Verify: `the default is ask …` (test/compact-note.test.ts).
- [x] 2.2 Settings row "Compact note" in en and es (choices `ask` / `skip`, hint "ask opens a note before compacting;
  skip compacts at once"), the draft, the lock and the write of the variable. Verify: `the modal writes TAB_RECAP_COMPACT_NOTE …`
  and `a locked row is never written` (test/compact-note.test.ts); the navigation and row positions in
  test/setup-keys.test.ts, test/setup-view.test.ts and test/curator-setup.test.ts.

## 3. The request without a popup (design decisions 1, 3 and 5)

- [x] 3.1 `application/compact-start.ts`: `startCompact` (the popup for `ask` without a note; the request queued at once
  otherwise, with the note or none) and `requestNoteOf` (the popup's `noteOf`, at most 280 characters).
  Verify: the tests in test/compact-note.test.ts.
- [x] 3.2 `bin/tab-recap.ts`: `--note <text>` parsed with `parseArgs` for `compact` only (a usage error on any other command,
  and without a value); `compact` calls `startCompact`; a failed queue says "the compaction was not requested". Verify:
  `compact --note …`, `--note on another command …` (test/compact-note-cli.test.ts) and `the default (ask) …`.
- [x] 3.3 `column/main.ts`: `c` outside the modal calls `startCompact` with the setting, so `skip` queues from the column;
  `ask` opens the popup as before. Verify: the decision is `startCompact`'s (test/compact-note.test.ts). The column is a
  pane process with no test harness, so its wiring is checked by reading the code and by the live check, not by a test.

## 4. Tests

- [x] 4.1 test/compact-note.test.ts: the default is `ask`; `ask` opens the popup and queues nothing; `skip` queues with no
  modal call; `skip` with no pane; `--note` queues with its text under either setting; `--note ""` queues with no note;
  the length and line rules; a failed queue or popup is reported; the settings row writes the key and a locked row does not.
- [x] 4.2 test/compact-note-cli.test.ts: the default asks (the popup fails with no herdr, nothing queued); `skip` queues with
  no note; `--note` queues with its text whatever the setting; `--note ""`; `--note` on another command and without a value.

## 5. Docs and screenshots

- [x] 5.1 `config.example.env` (`TAB_RECAP_COMPACT_NOTE=ask`), the README "Compaction" section (both skip paths, the 280-character
  rule) and `CONTEXT.md`. Verify: `bash ci/lint.sh` passes.
- [x] 5.2 Regenerate `docs/screens/setup-en.png` and `docs/screens/setup-es.png` with `docs/screens/shoot.mjs` (playwright-core,
  `--no-save`). Only those two images change.

## 6. Archive

- [x] 6.1 `openspec archive compact-without-note` in this merge request, once every other task is checked and the gates pass.
