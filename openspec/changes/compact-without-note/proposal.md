# Proposal

## Why

`tab-recap compact` (bound to `prefix+shift+c`, and `c` in a column or the modal) always opens the note popup,
and the compaction is queued only after the operator submits it. Operators who compact without a focus note
want the compaction queued at once, with no popup to dismiss, and who sometimes want to attach a note
without the popup at all (for example from a key binding that already knows what to say).

## What Changes

- **A setting, `TAB_RECAP_COMPACT_NOTE`.** `ask` (the default: today's popup) or `skip` (queue at once, no
  popup, no note). It is read on every use, no restart. It has a settings row "Compact note" in English and
  Spanish, with a hint, a line in `config.example.env` and a README entry.
- **`tab-recap compact --note "<text>"`.** Queues the compaction at once with that note, whatever the setting
  says, and opens no popup. `--note ""` queues with no note. Without `--note`, the setting decides. The note is
  kept as the popup keeps it: one line, trimmed, at most 280 characters.
- **`c` in a column follows the same setting.** With `skip`, `c` queues from the column; with `ask`, it opens the
  popup as before. From the modal, `c` runs the command, which decides the same way.
- **The request is the same.** `skip` and `--note` queue the request the popup sends (tab, pane, note, no
  origin, so `operator`), the same targets (`TAB_RECAP_COMPACT_TARGET`), the same toast.

## Out of scope

- Changing the popup itself: its keys, its layout, its 280-character limit and its Enter/Esc behaviour are unchanged.
- A per-compaction or per-tab setting. There is one setting, and `--note` is the per-invocation choice.
- Autocompact: it already queues without a popup and is governed by `TAB_RECAP_AUTOCOMPACT`.
- Changing what the agent is told, or the origin of the request. `skip` and `--note` stay `operator`.

## Changelog

This change lands on main through a merge request labelled `changelog::added`.
