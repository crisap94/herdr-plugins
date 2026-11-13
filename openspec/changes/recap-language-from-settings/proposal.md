# Proposal: the settings file decides the recap language and every recap follows it

## Why

An operator set the recap language to Spanish and recaps kept coming out in English. Six causes were found in the code: the
settings modal asked a rewrite only for the tab it was opened from; the rewrite line was sent on one run only, so facts the
writer left untouched stayed in the old language while the run was stamped with the new one; nothing told the writer the
language when it was English; the wrong-language gate G5 only flagged; an environment variable beat the language chosen in the
modal (and locked the modal's rows); and nothing said which language was in force or where it came from.

## What changes

- The writer's instructions name the language for English too.
- G5 refuses a fact in the wrong language, so it goes back once in the correction like the other refusals.
- While any open fact of the tab is stored in a language other than the recap language, every writer call carries the rewrite
  line from that language.
- Saving a language change in the settings modal requests a rewrite of the tab it was opened from and of every tab that has a
  stored view and a recap.
- For `TAB_RECAP_LOCALE` and `TAB_RECAP_RECAP_LANG` the settings file (what the modal writes) wins over the environment; the
  modal no longer locks those two rows. Every other key keeps the environment first.
- `tab-recap status` prints the recap language and where it came from: the settings file, an environment variable, or the
  system language.

## Out of scope

- Section headings in languages other than English and Spanish: the stored recap is drawn with the English or the Spanish
  catalog, and any other language name would need its own headings.
- `auto` still reads the environment of the process that resolves it (`LC_ALL`, then `LC_MESSAGES`, then `LANG`); `LANGUAGE` is
  not read.
- G5 still recognises only English and Spanish.

## Changelog label

The settings file winning over the environment for the two language keys is `changelog::changed`; everything else is
`changelog::fixed`. The commits are ordered so the owner can land them as one merge request labelled `changelog::changed` or
split the precedence commit into its own merge request.
