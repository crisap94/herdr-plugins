# curator-reconcile fresh sample (seed fresh-1/2026-11-14)

Six of the 24 fresh items, picked by the seed. Each section gives the plants, the input in short form, the answer key in plain words and the traps.

## frec-05-answered-trap-update-threshold

plants: answered-trap, stale, update, lookalike; size: medium

### Input

- f1 [goal] Rebuild the catalogue search index with the new analyzer and no downtime
- f2 [done] Wrote the new analyzer with stemming for English and German
- f3 [done] Added the indexing lag metric
- f4 [links] Search cluster dashboard
- f5 [decisions] Reindex from the database, not from the event stream
- f6 [next] Raise the alert threshold for indexing lag to the value the operator gives
- f7 [rules] Never delete an old index before the new one has served traffic for a day
- f8 [next] Switch the catalogue alias to the new index on production

Tail, oldest first:

- user: Explain how the alias switch works during a reindex.
- tool (read: search/reindex/switch.go): 
- agent: The reindex job writes into a fresh index whose name carries the date and time. Queries keep going to the alias, which points at the old index the whole time. When the new index holds every document and its count matches the database within a tenth of a percent, the job runs a set of sample queries against both indexes and compares the top results. Only if they agree well enough does it move the alias in one atomic step, so a query sees either the old index or the new one, never a mix. The old index stays for a day in case the alias has to move back. Nothing was changed; this is how the job is written.
- user: The lag alert woke the on-call twice last night for nothing.
- agent: It fires at 2 minutes of indexing lag, and the nightly price import alone causes about 6 minutes. What should the threshold be?
- user: Make it 15 minutes, and only page when it stays above that for 10 minutes.
- agent: Clear: 15 minutes, held for 10 minutes. The alert rule lives in the shared monitoring repository, so I will open a change there; it is not changed yet. On the reindex: the new index is built on production and serves shadow traffic, and the alias still points at the old one.

### Answer key

- update f6 to "Raise the indexing lag alert to 15 minutes held for 10 minutes", quoting "Make it 15 minutes, and only page when it stays above that for 10 minutes"
- stay open: f1, f2, f3, f4, f5, f7, f8
- lookalike f8, must not settle it: "the new index is built on production and serves shadow traffic"
- note: The operator gives the value a next fact waited for; the rule is not changed yet, so the fact is updated to the value, not closed. The new index is built, but the alias is not switched.

### Traps

- answered-trap, expect refused: [{"op":"close","id":"f6","why":"answered","evidence":"Make it 15 minutes"}]
- lookalike, expect kept: [{"op":"close","id":"f8","why":"done","evidence":"the new index is built on production and serves shadow traffic"}]

owner: 

## frec-06-answered-trap-large

plants: answered-trap, stale, lookalike; size: large

### Input

- f1 [done] Added the account currency to every exported line
- f2 [goal] Sign every ledger export file and move the exports to the new storage bucket
- f3 [done] Wrote the test that compares an export with a stored golden file
- f4 [rules] Amounts in an export are written as integer minor units
- f5 [decisions] Keep one export file per legal entity
- f6 [rules] An export never holds a customer name, only the account number
- f7 [next] Implement the rounding of converted amounts in the way the operator chooses
- f8 [done] Cleaned the exports older than five years out of the old bucket
- f9 [done] Added a metric for the number of lines in each export
- f10 [done] Added retries with backoff around the bucket upload
- f11 [decisions] Write exports as CSV with a header line
- f12 [links] Signing key ceremony notes
- f13 [done] Wrote the parser test for credit notes with negative amounts
- f14 [next] Add a command that verifies the signature of an export file
- f15 [links] Merge request 311: split export job
- f16 [links] Export runbook
- f17 [done] Split the export job into a fetch step and a write step
- f18 [done] Fixed the time zone of the export file names to UTC
- f19 [rules] A change to the export format is announced to finance a week ahead
- f20 [done] Documented the export columns
- f21 [done] Moved the export schedule from 02:00 to 03:30 UTC
- f22 [next] Ask finance to verify one signed export by hand
- f23 [next] Delete the old export bucket once the last copy is checked
- f24 [decisions] Use Ed25519 keys to sign exports
- f25 [done] Removed the XML export format and its tests
- f26 [done] Created the service account that writes to the new bucket
- f27 [links] Bucket policy draft

Tail, oldest first:

- user: Walk me through how the export job picks the lines for a day. I want to be sure nothing is counted twice.
- tool (read: jobs/export/fetch.go): 
- agent: The fetch step asks the ledger for every posting whose booking time falls in the export day, in UTC, for one legal entity at a time. It orders them by posting id and reads them in pages of 5,000, remembering the last id of each page and asking for the ids after it, so a posting that arrives while the job runs either falls into a page or comes after the last one; it is never read twice. Reversals are separate postings with their own id and a negative amount, so they show up as lines of their own rather than changing an earlier line. The write step then turns the postings into CSV lines in the same order. Nothing in this path deduplicates, because nothing in it can duplicate. I only read the code.
- user: Why does the month-end export take 40 minutes when a normal day takes three?
- tool (shell: export-job profile --date 2026-10-31): fetch 36 m 40 s; write 2 m 10 s; upload 0 m 50 s
- agent: The time goes into the fetch step: 36 minutes of the 40. At month end the ledger holds about twelve times the usual number of postings for the last day, because the accruals and the closing entries are booked then, and the query that reads them uses the index on booking time but then sorts by posting id in memory. With a combined index on entity, booking time and posting id the sort would disappear. I tried the query plan on a copy of the database: with that index the month-end fetch would take about 4 minutes. The index is a change to the ledger schema, which belongs to the ledger team, so I did not create it.
- user: What happens when the upload to the bucket fails halfway?
- tool (read: jobs/export/upload.go): 
- agent: The upload writes the file under a temporary name first. Only when every byte is written and the checksum the bucket reports matches the one we computed does the job rename it to its final name. A failure in the middle leaves a temporary file behind, which the bucket removes by itself after a day, and the job retries up to five times with growing waits, from 10 seconds to about 3 minutes. If all five tries fail, the job exits with an error and the alert goes to the finance on-call channel. Finance never sees a half-written file under a final name, because the rename is the last step. I changed nothing.
- agent: For converting amounts in a foreign currency to the entity currency: should halves round up, or round to even?
- user: Round to even. That is what the finance tool does, and the totals must match theirs to the cent.
- tool (edit: jobs/export/convert.go): 
- tool (shell: go test ./jobs/export/...): ok  finance/export/jobs/export 2.3s
- agent: Converted amounts now round half to even, and a new test checks the totals of a sample month against the figures from the finance tool: they match to the cent. The verify command exists as a draft on my branch; it reads the signature file but cannot check it until the public key is published.
- user: Which columns does finance actually use? I suspect half of them are never read.
- tool (read: docs/export-columns.md): 
- agent: From the import mapping finance shared last month, they read 11 of the 17 columns: posting id, booking date, account number, entity, currency, amount in minor units, amount in entity currency, counter account, document number, cost centre and the reversal flag. The other six, among them the created-by field and the two internal batch ids, map to nothing on their side. Dropping them would make each file about a third smaller, but the format rule says every change is announced a week ahead, and a removed column could break some script elsewhere that we do not know of. I would ask before removing anything; no change made.
- user: How does the golden file test decide that an export is right?
- tool (read: jobs/export/golden_test.go): 
- agent: The test runs the whole export for a fixed day against a small seeded ledger of 240 postings, then compares the produced file with the stored golden file line by line. Any difference fails the test and prints the first ten lines that differ. The seeded ledger covers the awkward cases on purpose: a posting exactly at midnight, a reversal, an amount of zero, a posting in a foreign currency and an account number with leading zeros. When the format changes on purpose, the golden file is regenerated with a flag and the difference is reviewed in the merge request like any other change. I only read the test.
- user: Explain the plan for signing in plain words, so I can tell finance.
- tool (read: docs/key-ceremony.md): 
- agent: Each export file gets a second, small file next to it with the same name and the ending .sig. That file holds a signature made with the private key of the legal entity. Anyone with the matching public key can check that the export came from our job and was not changed afterwards, not even by one character. The private keys live only in the signing service, and the export job asks that service to sign a checksum of the file; it never sees a key. Finance needs the public keys once, and their tool can then check every file on import and refuse one that does not match. That is the plan as the ceremony notes describe it.

### Answer key

- close f7 as done, quoting "Converted amounts now round half to even"
- stay open: f1, f2, f3, f4, f5, f6, f8, f9, f10, f11, f12, f13, f14, f15, f16, f17, f18, f19, f20, f21, f22, f23, f24, f25, f26, f27
- lookalike f14, must not settle it: "The verify command exists as a draft on my branch"
- note: The operator answers the question inside a next fact, then the agent implements and tests it: the fact closes as done, quoting the agent. The verify command is only a draft.

### Traps

- answered-trap, expect refused: [{"op":"close","id":"f7","why":"answered","evidence":"Round to even"}]
- lookalike, expect kept: [{"op":"close","id":"f14","why":"done","evidence":"The verify command exists as a draft on my branch"}]

owner: 

## frec-07-long-evidence-staging-migration

plants: long-evidence, stale, lookalike; size: small

### Input

- f1 [rules] Every schema change ships with a rollback script
- f2 [next] Run the waiting list migration on production
- f3 [next] Run the migration that adds the waiting list table on staging
- f4 [goal] Add a waiting list to the clinic booking portal so freed slots go to waiting patients

Tail, oldest first:

- user: Run the waiting list migration on staging now, the backup is done.
- tool (shell: pnpm migrate --env staging): applied 0031_waiting_list (41.2 s)
- tool (shell: pnpm test:e2e --env staging): 3 passed
- agent: After the backup finished at 09:12 and the lock on the bookings table was released, the migration that adds the waiting list table ran on staging in 41 seconds, and the end-to-end test that books, cancels and rebooks a slot passed three times in a row, so nothing on staging stands in the way of the production window on Thursday. Production itself is untouched.

### Answer key

- close f3 as done, quoting "the migration that adds the waiting list table ran on staging in 41 seconds"
- stay open: f1, f2, f4
- lookalike f2, must not settle it: "nothing on staging stands in the way of the production window on Thursday"
- note: The settling sentence is longer than 240 characters; the short span inside it settles the staging fact. Production is explicitly untouched.

### Traps

- long-evidence, expect refused: [{"op":"close","id":"f3","why":"done","evidence":"After the backup finished at 09:12 and the lock on the bookings table was released, the migration that adds the waiting list table ran on staging in 41 seconds, and the end-to-end test that books, cancels and rebooks a slot passed three times in a row, so nothing on staging stands in the way of the production window on Thursday"}]
- lookalike, expect kept: [{"op":"close","id":"f2","why":"done","evidence":"nothing on staging stands in the way of the production window on Thursday"}]

owner: 

## frec-14-add-bait-quiet

plants: add-bait, lookalike; size: small

### Input

- f1 [rules] No driver gets a route longer than nine hours
- f2 [rules] The planner never sends a van over a bridge whose weight limit is below the loaded van
- f3 [next] Respect the delivery time windows of each stop in the 05:00 plan

Tail, oldest first:

- user: A dispatcher called: the bridge at Elm Ford is closed for repairs from Monday for three weeks. Nothing to do on the code for now, I just want you to know.
- agent: Noted: the bridge at Elm Ford is closed from Monday for three weeks. I checked the planner on the side: time windows are read from the import and shown on each stop, but the solver still ignores them when it orders the stops.

### Answer key

- stay open: f1, f2, f3
- lookalike f3, must not settle it: "time windows are read from the import and shown on each stop"
- note: The operator reports a new road closure that is not in the ledger; nothing may be added. Time windows are imported but the solver ignores them. No operation is expected.

### Traps

- add-bait, expect refused: [{"op":"add","section":"next","text":"Route around the Elm Ford bridge while it is closed for repairs","evidence":"the bridge at Elm Ford is closed for repairs from Monday for three weeks"}]
- lookalike, expect kept: [{"op":"close","id":"f3","why":"done","evidence":"time windows are read from the import and shown on each stop"}]

owner: 

## frec-20-near-pair-component

plants: near-pair, add-bait, stale; size: medium

### Input

- f1 [next] Fix the calibration drift of the moisture sensor on revision C probes
- f2 [decisions] Keep the last 48 hours of readings in flash
- f3 [done] Replaced the floating point humidity formula with a lookup table
- f4 [goal] Ship firmware 2.4 for the grain probes with lower power use and over-the-air updates
- f5 [done] Fixed the off-by-one in the battery level percentage
- f6 [next] Store the calibration constants in flash instead of in the firmware image
- f7 [done] Measured the idle current of the probe board at 38 microamps
- f8 [next] Fix the calibration drift of the temperature sensor on revision C probes

Tail, oldest first:

- user: What did the overnight drift test show?
- tool (shell: probe-bench drift --hours 12 --board rev-c): moisture +2.8 % / 12 h; temperature +0.9 C / 12 h
- agent: Over 12 hours the moisture sensor drifted by 2.8 percent and the temperature sensor by 0.9 degrees, both beyond their tolerance. Neither compensation is written yet. The calibration constants are now stored in flash instead of in the firmware image, so a recalibration no longer needs a new build. Also: the bench supply for the revision C boards is failing, it sagged to 2.9 volts twice tonight and should be replaced before any power measurement.

### Answer key

- close f6 as done, quoting "The calibration constants are now stored in flash instead of in the firmware image"
- stay open: f1, f2, f3, f4, f5, f7, f8
- note: Two open facts differ only in the sensor (moisture or temperature); both drift and stay open. The constants moved to flash. A failing bench supply is new and may not be added.

### Traps

- near-pair, expect kept: [{"op":"close","id":"f8","why":"merged","into":"f1"}]
- add-bait, expect refused: [{"op":"add","section":"next","text":"Replace the failing bench supply of the revision C boards","evidence":"the bench supply for the revision C boards is failing"}]

owner: 

## frec-23-near-pair-compaction

plants: near-pair, long-evidence, compaction, stale; size: medium

### Input

- f1 [decisions] Offer a freed slot to one waiting patient at a time
- f2 [rules] Every schema change ships with a rollback script
- f3 [next] Send a reminder SMS to patients 24 hours before their booking
- f4 [goal] Add a waiting list to the clinic booking portal so freed slots go to waiting patients
- f5 [next] Let patients cancel a booking from the reminder SMS
- f6 [next] Remove patient phone numbers from the offer sender log lines
- f7 [rules] Patient phone numbers never appear in logs
- f8 [next] Send a reminder SMS to patients 2 hours before their booking

Tail, oldest first:

- user: The context of this session filled up, so its earlier part was compacted. What follows is the summary of that part.

1. The task is the waiting list for the clinic booking portal.
2. Slot offers go out by SMS.
3. Patients can cancel a booking by replying to the reminder SMS.
4. Current work: the logging of the offer sender.
- agent: Resuming with the logging of the offer sender.
- user: How does a freed slot reach a waiting patient today, step by step?
- tool (read: src/offers/flow.ts): 
- agent: When a booking is cancelled, the booking service emits a slot release event with the clinic, the time and the kind of appointment. The waiting list service picks the patient who has waited longest for that kind of appointment at that clinic and marks the slot as offered to them, so nobody else can be offered it at the same moment. The offer then goes to the sender, which writes the message. If the patient accepts, the slot becomes their booking; if they decline, the next patient in line gets the offer. This is how the main branch behaves; I changed nothing.
- tool (edit: src/offers/sender.ts): 
- tool (shell: pnpm test offers): 15 passed
- agent: Because the log lines were built in three different places and one of them dumped the whole request object, including the recipient, I moved all logging of the offer sender into one function that masks the number to its last two digits, which removes the patient phone numbers from the offer sender log lines, and a new test fails if a full number ever shows up in a log line again. Nothing has been done on the reminders yet, neither the 24 hour one nor the 2 hour one.

### Answer key

- close f6 as done, quoting "which removes the patient phone numbers from the offer sender log lines"
- stay open: f1, f2, f3, f4, f5, f7, f8
- summary claim f5, only in a summary: "Patients can cancel a booking by replying to the reminder SMS"
- note: Two open facts differ only in the reminder time (24 or 2 hours); both stay open. The log fix is done, said in a sentence longer than 240 characters. The summary claims cancelling by SMS works; no real turn says so.

### Traps

- near-pair, expect kept: [{"op":"close","id":"f8","why":"merged","into":"f3"}]
- long-evidence, expect refused: [{"op":"close","id":"f6","why":"done","evidence":"Because the log lines were built in three different places and one of them dumped the whole request object, including the recipient, I moved all logging of the offer sender into one function that masks the number to its last two digits, which removes the patient phone numbers from the offer sender log lines, and a new test fails if a full number ever shows up in a log line again"}]
- compaction, expect kept: [{"op":"close","id":"f5","why":"done","evidence":"Patients can cancel a booking by replying to the reminder SMS"}]

owner: 

