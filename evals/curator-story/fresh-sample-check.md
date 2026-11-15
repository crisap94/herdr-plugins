# Sample check: curator-story fresh set

The owner delegated this check to Claude on 2026-11-15. Claude Opus checked each of the six items in `fresh-sample.md` against its turns and the eval's SPEC. An item found wrong was fixed and re-reviewed by Claude Sonnet. Nobody else has checked these items.

## fcs-05-closebait-near-waiting-large

checked: ok. f28 (macOS, 31 of 31) and f32 (Windows, 29 of 31, symlink cases skipped) do differ in a material detail, and f43 is the only open needs fact. The close-bait op closes f22 with why 'done', which the contract does not allow because the curator may only close a fact as 'merged'; language en.

## fcs-06-closedmerge-json-small

checked: ok. The ledger holds no open duplicate, no open needs and no closed wrong/superseded/answered fact, so an empty key is right. The trap merges f2, which is already closed (as done), into f6, which the gate must refuse; language en.

## fcs-07-closedmerge-near-small

checked: ok. f4 (staging) and f5 (production) differ only in the environment, which is a material detail, so keeping them apart is right. The trap closes f2, a closed (superseded) fact, which must be refused; language en.

## fcs-14-chain-closed-large

checked: wrong, fixed. Found: The line 'merge f35 and f51 (verbatim)' lets either direction count as right, but f29 is a reworded copy of both f35 and f51, and only [f29,f35] is listed. A model that closes f35 into f51 (allowed) has to close f29 into f51 to avoid a chain, and that equally valid merge fails S7 and breaches S10. The key needs to pin f35 as the kept fact or also accept f29 into f51.

Fixed in the scorer: verbatim copies are one class for S7, S8 and S10, so both right answers pass and a chain is still refused (self-test cases on this item). Re-reviewed by Sonnet: ok.

## fcs-20-longpressure-near-large

checked: ok. f22 and f39 match word for word (same section, text and ref), and f25 (monthly, 6 min, 4200 employees) and f28 (weekly, 2 min, 900 employees) differ in material numbers. The trap closes each copy into the other, a cycle the gate must refuse; language en.

## fcs-23-thin-closed-small

checked: ok. f6 adds expired cards to the balance rule, so f3 is superseded. f8 (1840 euros above the finance figure) contradicts f5, so f5 is wrong, and both must_not_say lines follow from that. The trap merges the closed f5, which must be refused; language en.

Result: all six items ok after the fixes; EVAL-7 may start.
