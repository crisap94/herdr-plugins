## Why

A tab whose recap is already stamped in the recap language can still hold open facts in the old language, the state the earlier
language bug left behind. Nothing repaired those facts unless new transcript content arrived, so an idle tab kept its English facts
after a request or a focus.

## What Changes

- A requested or turn-ended run for a tab whose open facts are not all in the recap language counts as a switch, even when the recap is already stamped in the recap language. A focused run does not, so a quiet focus does not call the writer forever.
- The rewrite line is sent with the previous language taken from the first stale fact.
- A focused or requested run with nothing new and no stale fact still calls no writer.
