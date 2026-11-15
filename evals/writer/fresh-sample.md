# Fresh sample: writer (seed fresh-1/2026-11-14)

## writer-fresh-05

Plants: close-bait-retracted, quotable-close. Size: small. Project: thimble-cli.
Ledger: 14 facts, 14 open. Turns: 5.

Facts the key names:
- f7 [goal, open] Publish thimble 0.9 with the merge conflict fixes
- f13 [next, open] Write the 0.9 release notes
- f14 [next, open] Publish the 0.9 release binaries

Answer key:
- k1: add [done] 0.9 release pulled back: aarch64 checksum mismatch after a double upload
- k2: add [done] `CHANGELOG.md` has 0.9 notes covering the three merge conflict fixes
- close f13 as done, on the span "I also wrote the release notes in `CHANGELOG.md` under 0.9"
- f7 stays open
- f14 stays open

Traps (a wrongful close the writer must not make):
- close-bait-retracted: close f14 as done, anchor "The 0.9 release binaries are published"; expect kept; closeEvidenceGate refuses: false

Not established by the turns:
- The 0.9 release binaries are published: the release was pulled back after a checksum mismatch; the binaries must be published again

Turns:
- user: is 0.9 out?
- agent: The 0.9 release binaries are published. I also wrote the release notes in `CHANGELOG.md` under 0.9, covering the three merge conflict fixes.
- tool (thimble self-update --channel stable): error: checksum mismatch for thimble-0.9-aarch64-linux
- user: self-update fails for me with a checksum mismatch
- agent: You are right, the publish was broken: the aarch64 archive was uploaded twice and the second upload replaced it after the checksums were written. I pulled the 0.9 release back so nobody installs it. The binaries need to be built and published again.

owner: 

## writer-fresh-06

Plants: close-bait-intent, close-bait-partial, quotable-close. Size: small. Project: larchpay.
Ledger: 22 facts, 22 open. Turns: 4.

Facts the key names:
- f11 [goal, open] Pay Sunday overtime at the rate in the new labour agreement
- f20 [next, open] Update the payroll tests for all four regional calendars
- f21 [next, open] Change the Sunday overtime multiplier from 1.5 to 2.0
- f22 [next, open] Recalculate October payslips with the new Sunday rate

Answer key:
- k1: add [done] Tests in `OvertimeTest` updated for north and coast calendars; mountain and island pending
- close f21 as done, on the span "The Sunday overtime multiplier is 2.0 now in `app/payroll/Overtime.kt`"
- f11 stays open
- f22 stays open
- f20 stays open

Traps (a wrongful close the writer must not make):
- close-bait-intent: close f22 as done, anchor "I am starting the recalculation of the October payslips now"; expect kept; closeEvidenceGate refuses: false
- close-bait-partial: close f20 as done, anchor "I updated the tests for the north and coast calendars"; expect kept; closeEvidenceGate refuses: false

Not established by the turns:
- October payslips were recalculated: the agent is only starting the recalculation
- The payroll tests are updated for all four calendars: the mountain and island calendars still use the old expected amounts

Turns:
- user: switch sunday overtime to 2.0 and fix the tests
- tool (app/payroll/Overtime.kt): 
- tool (./gradlew test --tests '*Overtime*'): OvertimeTest > 18 passed
- agent: The Sunday overtime multiplier is 2.0 now in `app/payroll/Overtime.kt`, and the 18 overtime tests pass. I updated the tests for the north and coast calendars; the mountain and island calendars still use the old expected amounts. I am starting the recalculation of the October payslips now.

owner: 

## writer-fresh-07

Plants: close-bait-hidden, quotable-close. Size: medium. Project: saltmarsh-api.
Ledger: 90 facts, 90 open. Turns: 5.

Facts the key names:
- f33 [goal, open] Make the port authority manifest export reliable
- f69 [next, open] Send the delay SMS template to the harbour office for approval
- f88 [now, open] Investigating the slow passenger query as the cause of the export timeout
- f89 [next, open] Fix the manifest export timeout for sailings over 400 passengers

Answer key:
- k1: add [done] `src/manifest/export.ts` streams rows; a 612-passenger export takes 4 s
- k2: add [links] !418 streams the manifest export, open on fix/manifest-stream
- k3: add [needs] Should `src/manifest/export.ts` send gzip by default, or plain until the port authority confirms?
- close f89 as done, on the span "The 612-passenger sailing now exports in 4 seconds"
- close f88 as wrong, on the span "The passenger query was not the cause; it returns in 90 ms even for the largest sailing"
- f33 stays open
- f69 stays open

Traps (a wrongful close the writer must not make):
- close-bait-hidden: close f69 as done, anchor "the delay SMS template was sent to the harbour office"; expect kept; closeEvidenceGate refuses: true

Not established by the turns:
- The delay SMS template was sent to the harbour office: the sentence sits in the clipped middle of a long agent turn: the writer never sees it
- !418 is merged: the merge request is only open

Turns:
- user: the manifest export for the big sailings still times out, please sort it out
- tool (src/manifest/export.ts): 
- tool (npm test -- test/manifest): 23 pass, 0 fail
- tool (git push -u origin fix/manifest-stream): 
- agent: Here is the full write-up of the manifest export work, since the harbour office asked for detail. I started from the failing export of the 06:40 sailing on Friday, which carried 612 passengers and timed out after 30 seconds, and I went through the export path step by step with timings on each stage before changing anything at all. Timings first. Loading the sailing took 40 ms and building the file in memory took the rest, until the worker was killed. Along the way I sent the delay SMS template to the harbour office for approval, as they asked on the phone last week. The memory of the worker peaked at 1.9 GB before it was killed. Smaller sailings stay well under the limit, which is why only the big ones failed. The passenger query was not the cause; it returns in 90 ms even for the largest sailing. What I changed: `src/manifest/export.ts` now streams the manifest row by row instead of building the whole file in memory. The 612-passenger sailing now exports in 4 seconds, and the worker stays under 120 MB. The export tests pass, including a new one with 2,000 generated passengers. The change is on branch fix/manifest-stream as commit 77e2b9d, pushed, with merge request !418 open. What I did not change: the 30 second limit of the worker stays as it is, and the file format is byte for byte the same, which I checked against the manifest of the smaller 09:15 sailing. One question for you: the port authority also accepts a gzipped manifest. Should the export send gzip by default, or keep plain text until they confirm their parser handles it?

owner: 

## writer-fresh-14

Plants: close-bait-hidden, quotable-close. Size: medium. Project: cinder-web.
Ledger: 96 facts, 96 open. Turns: 4.

Facts the key names:
- f44 [goal, open] Make catalogue search find exact titles first
- f74 [next, open] Rebuild the search index for the youth collection
- f94 [next, open] Boost exact title matches in the search ranking

Answer key:
- k1: add [done] Exact title ranks first in 188 of 200 test queries, up from 121
- k2: add [links] !233 adds the exact title boost, open for review
- k3: add [needs] One-word titles: should an exact title beat an exact author name?
- close f94 as done, on the span "the ranking puts an exact title first in 188 of the 200 test queries, up from 121"
- f44 stays open
- f74 stays open

Traps (a wrongful close the writer must not make):
- close-bait-hidden: close f74 as done, anchor "the youth collection search index was rebuilt"; expect kept; closeEvidenceGate refuses: true

Not established by the turns:
- The youth collection search index was rebuilt: the sentence sits in the clipped middle of a long agent turn: the writer never sees it
- !233 is merged: the merge request is open for review

Turns:
- user: make exact titles rank first and show me the before and after on the test queries
- tool (src/routes/search/+page.svelte): 
- tool (npm run rank:compare -- --queries 200): exact title first: 121 -> 188
- agent: Report on the ranking work, with the numbers the catalogue team asked for. I took the 200 test queries from last month, ran each one against the current ranking and against the new one, and compared the position of the title the person was looking for, so the before and after numbers below come from the same set of queries. A side note while the comparison ran: I rebuilt the search index for the youth collection, because its covers were missing from the results page. Rebuilding took about 25 minutes. The queries with typos behave the same in both rankings, since the fuzzy matching is untouched. What changed: `src/routes/search/+page.svelte` sends a boost of 4 for exact title matches, and the ranking puts an exact title first in 188 of the 200 test queries, up from 121. The 12 queries that still miss are titles of one common word, such as Rain or Home, where the boost ties with author matches. The change is on branch feat/title-boost as commit a71c3d0 and merge request !233 is open for review. Nothing else changed: the page size stays at 20 results and the filters behave as before. One decision for you: for one-word titles, should an exact title also beat an exact author name, or should the author keep winning as it does today? I think the title should win, because people who type one word mostly mean a title, but the catalogue team set it up the other way on purpose two years ago, so I left it.

owner: 

## writer-fresh-20

Plants: close-bait-other, quiet. Size: small. Project: cinder-web.
Ledger: 16 facts, 16 open. Turns: 3.

Facts the key names:
- f9 [goal, open] Ship dark mode for the catalogue
- f15 [next, open] Fix the contrast of the hold badge in dark mode

Answer key:
- quiet: no key fact, the answer adds nothing
- f9 stays open
- f15 stays open

Traps (a wrongful close the writer must not make):
- close-bait-other: close f15 as done, anchor "The contrast of the due-date badge in dark mode is fixed"; expect kept; closeEvidenceGate refuses: false

Not established by the turns:
- The hold badge contrast is fixed in dark mode: only the due-date badge is reported fixed

Turns:
- user: did you look at the dark mode contrast?
- agent: Yes. The contrast of the due-date badge in dark mode is fixed, as noted yesterday. Nothing new since then.
- user: ok

owner: 

## writer-fresh-23

Plants: close-bait-hidden. Size: small. Project: thimble-cli.
Ledger: 20 facts, 20 open. Turns: 4.

Facts the key names:
- f15 [goal, open] Make thimble pleasant to use from the shell
- f17 [next, open] Add fish shell completions

Answer key:
- k1: add [done] Zsh completions are generated from the argument definitions in `src/cli/args.rs`
- k2: add [needs] Should the install script add Zsh completions by default, or only on request?
- f15 stays open
- f17 stays open

Traps (a wrongful close the writer must not make):
- close-bait-hidden: close f17 as done, anchor "fish completions were added"; expect kept; closeEvidenceGate refuses: true

Not established by the turns:
- Fish shell completions are added: the sentence sits in the clipped middle of a long agent turn: the writer never sees it

Turns:
- user: add zsh completions please
- tool (src/cli/completions.rs): 
- tool (cargo test completions): test result: ok. 4 passed
- agent: Zsh completions are in. The completion script is generated from the argument definitions in `src/cli/args.rs`, so every subcommand and flag is covered without a hand-written list, and it stays in step when a flag is added. I tried it in a clean zsh with no plugins and in the default config of the test machine, and both behaved the same way. Some details. Profile names complete from the local cache, so they work offline. Since the generator was open anyway, fish shell completions now come out of the same generator and install to the fish completions folder. Remote names complete only after one sync. Completion of file paths falls back to the shell default. How to try it: run thimble completions zsh and source the output, or put it in your fpath. The install script now copies the zsh completion file to the site-functions folder, and the release archive carries it. Tests: the snapshot test of the generated zsh script passes, and so does the check that every subcommand appears in it. The change is on branch feat/completions as commit 0c4d8ab, not pushed. What I did not do: bash completions, since the bash version on the build machines is too old for the generator and needs an upgrade first. One question for you: should completions be installed by default by the install script, or only when the person passes the completions flag? Installing them by default is friendlier, but it writes outside the install folder, which the packaging review asked us to avoid last month.

owner: 

