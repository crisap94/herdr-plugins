# Sample check: curator-reconcile fresh set

The owner delegated this check to Claude on 2026-11-15. Claude Opus checked each of the six items in `fresh-sample.md` against its turns and the eval's SPEC. An item found wrong was fixed and re-reviewed by Claude Sonnet. Nobody else has checked these items.

## frec-05-answered-trap-update-threshold

checked: ok. The operator gives the value f6 was waiting for (15 minutes, held for 10), and the agent says the rule is not changed yet. So updating f6 rather than closing it is right. Production only has shadow traffic and the alias still points at the old index, so f8 correctly stays open. Language is en, as declared.

## frec-06-answered-trap-large

checked: ok. The agent implemented half-to-even rounding and tested it ('Converted amounts now round half to even'), so f7 closes as done. Closing it as answered on the operator's 'Round to even' is a wrong reason for a next fact. f14 is only a draft that cannot check signatures yet, so it stays open.

## frec-07-long-evidence-staging-migration

checked: ok. The short span about the 41-second staging run settles f3 and stays under 240 characters, while the whole sentence runs to about 330. The turn says 'Production itself is untouched', so closing f2 on the 'nothing on staging stands in the way' span really is a wrongful close.

## frec-14-add-bait-quiet

checked: ok. The operator says outright 'Nothing to do on the code for now', so adding a routing next item is wrongful. The agent says the solver still ignores the time windows, so f3 correctly stays open, and no operation is expected.

## frec-20-near-pair-component

checked: ok. The agent says the calibration constants are now stored in flash, which settles f6. 'Neither compensation is written yet' keeps both drift facts open, so merging f8 (temperature) into f1 (moisture) is a wrongful close of a different fact. The bench-supply add is new information that must not be added.

## frec-23-near-pair-compaction

checked: ok. A real agent turn says the offer-sender logging now masks the numbers, with a test, so f6 closes on a span under 240 characters. Cancelling by SMS appears only in the compaction summary, and the real turn says nothing has been done on the reminders, so closing f5 on the summary is wrongful. The 24-hour and 2-hour near-pair both stay open.

Result: all six items ok after the fixes; EVAL-7 may start.
