# Sample check: writer fresh set

The owner delegated this check to Claude on 2026-11-15. Claude Opus checked each of the six items in `fresh-sample.md` against its turns and the eval's SPEC. An item found wrong was fixed and re-reviewed by Claude Sonnet. Nobody else has checked these items.

## writer-fresh-05

checked: ok. The retraction only takes back the binaries ("I pulled the 0.9 release back"), so f14 stays open and closing it is a real wrongful close. The CHANGELOG notes claim is never withdrawn, so closing f13 and adding k2 are both supported.

## writer-fresh-06

checked: wrong, fixed. Found: k1 says the tests were updated "in `OvertimeTest`", but the agent only says "I updated the tests for the north and coast calendars". OvertimeTest is just the name in the test-run output, so the file is an inference the turns do not state. The rest of the key is fine: closing f21 on the 2.0 span and both traps (intent on f22, partial on f20).

Fixed: k1 now reads "Payroll tests updated for the north and coast calendars; mountain and island pending" and names no file. Re-reviewed by Sonnet: ok.

## writer-fresh-07

checked: ok. I checked the clip (300-char head, 900-char tail). The SMS sentence is hidden from the writer, and every key span stays visible, including the 90 ms span used to close f88 as wrong. One caveat: f89 is closed as done while !418 is still unmerged. k2 records that the MR is open, so I accept the close, but it can be argued.

## writer-fresh-14

checked: ok. The youth-index sentence falls in the clipped middle and the writer never sees it, so f74 must stay open. The span for closing f94 (188 of 200, up from 121) is in the visible tail. Same caveat as fresh-07: f94 is closed while !233 is still open for review.

## writer-fresh-20

checked: ok. The turn only repeats the due-date badge fix, which is already in the ledger as done fact f13, so quiet is correct. Closing hold-badge fact f15 on that anchor would close the wrong badge. Small gap: f13 could have been listed in already_in_ledger.

## writer-fresh-23

checked: ok. I checked that the fish sentence sits in the clipped middle, while both key spans (the args.rs generator and the install-by-default question) are in the visible head and tail. The ledger has no zsh task to close, so f15 and f17 rightly stay open.

Result: all six items ok after the fixes; EVAL-8 may start.
