# Tasks: the settings file decides the recap language and every recap follows it

Each group is one commit. Every group ends with the plugin gates passing (`bash ci/lint.sh` and `bash ci/test.sh`, from
`tab-recap/`).

## 1. The writer is always told the language

- [x] 1.1 `languageLines` in `tab-recap/src/adapters/job/prompts/recap-instructions.ts` gives English its own line; the reviewed
      instructions in `tab-recap/test/fixtures/instructions-en.txt` carry it.
- [x] 1.2 The plugin gates pass.

## 2. A fact in the wrong language is sent back

- [x] 2.1 G5 (`tab-recap/src/recap/domain/gates/language.ts`) refuses instead of flagging; the gate tests, `CONTEXT.md`,
      `docs/REFERENCE.md` and `GUIDE.md` say so.
- [x] 2.2 The plugin gates pass.

## 3. Old facts are rewritten until none is left in the old language

- [x] 3.1 The recap job sends as the previous language the stored language of the first open fact that is not in the recap
      language, and the stored recap's language when there is none.
- [x] 3.2 The plugin gates pass.

## 4. Saving a language change rewrites every recap

- [x] 4.1 `requestRewrites` in `tab-recap/src/recap/application/setup-changes.ts` requests the opener and every tab with a stored
      view and a recap; the settings modal calls it on every language save.
- [x] 4.2 The plugin gates pass.

## 5. The settings file wins for the language keys

- [x] 5.1 `loadConfig` and `configGetter` read `TAB_RECAP_LOCALE` and `TAB_RECAP_RECAP_LANG` from the file first; the modal does not
      lock those rows; the README, the guide and `config.example.env` say so.
- [x] 5.2 The plugin gates pass.

## 6. Status names the recap language and its source

- [ ] 6.1 `recapLanguageSource` in `tab-recap/src/daemon/config.ts`; `tab-recap status` prints `language <code> (<source>)`.
- [ ] 6.2 The plugin gates pass.

## 7. Archive

- [ ] 7.1 Every task above is checked; `openspec archive recap-language-from-settings` runs in this merge request and
      `openspec validate --specs --strict` passes.
