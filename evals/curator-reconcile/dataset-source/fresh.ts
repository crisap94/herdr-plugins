import { a, ed, f, rd, sh, sumU, u } from './pools.ts';
import type { E, F, Project, Section } from './pools.ts';
import type { Case } from './cases.ts';

// FRESH-1a: the fresh items of curator-reconcile. All names, places and hosts are invented; hosts end in .test.
// Fact keys (`k`) work as in cases.ts. In a trap, `id` and `into` hold fact keys; the builder maps them to
// document ids exactly as it maps the keys of `close`, `update`, `dup`, `look` and `claims`.

export type FreshProjectName = 'heronfield' | 'copperleaf' | 'saltmarsh' | 'windrow' | 'millrace' | 'thistledown';

export type TrapOp =
    | { readonly op: 'close'; readonly id: string; readonly why: 'done' | 'wrong' | 'superseded' | 'answered' | 'merged'; readonly evidence?: string; readonly into?: string }
    | { readonly op: 'add'; readonly section: Section; readonly text: string; readonly evidence: string };

export interface Trap {
    readonly kind: string;
    readonly ops: readonly TrapOp[];
    readonly expect: 'refused' | 'kept';
}

export interface FreshCase extends Omit<Case, 'project'> {
    readonly project: FreshProjectName;
    readonly traps: readonly Trap[];
}

const heronfield: Project = {
    title: 'Grain probe firmware 2.4',
    bg: [
        f('goal', 'goal', 'Ship firmware 2.4 for the grain probes with lower power use and over-the-air updates'),
        f('h1', 'done', 'Moved the probe scheduler from busy waiting to timer interrupts', { ref: 'firmware/src/sched.c' }),
        f('h2', 'done', 'Added a CRC to every radio packet sent by the probes'),
        f('h3', 'done', 'Measured the idle current of the probe board at 38 microamps'),
        f('h4', 'links', 'Probe fleet dashboard', { ref: 'https://fleet.heronfield.test/d/probes' }),
        f('h5', 'rules', 'Every firmware image is signed before it leaves the build machine'),
        f('h6', 'decisions', 'Keep the radio on the 868 MHz band', { why: 'the pilot farms all sit in the EU band plan' }),
        f('h7', 'done', 'Wrote the bootloader test that flashes a broken image and expects a rollback'),
        f('h8', 'done', 'Replaced the floating point humidity formula with a lookup table'),
        f('h9', 'links', 'Hardware revision C schematics', { ref: 'docs/hw/rev-c.pdf' }),
        f('h10', 'done', 'Set up the nightly firmware build for revision B and C boards'),
        f('h11', 'rules', 'No heap allocation after the probe has finished booting'),
        f('h12', 'decisions', 'Send readings in batches of 12', { why: 'each radio wake-up costs as much energy as 12 readings' }),
        f('h13', 'done', 'Fixed the off-by-one in the battery level percentage'),
        f('h14', 'done', 'Added the probe serial number to the boot banner'),
        f('h15', 'links', 'Over-the-air update design notes', { ref: 'https://wiki.heronfield.test/ota-design' }),
        f('h16', 'done', 'Removed the unused long-range radio driver from the build'),
        f('h17', 'rules', 'A firmware change that touches the radio is tested on real hardware, not only in the simulator'),
        f('h18', 'done', 'Documented version 3 of the packet format', { ref: 'docs/packet-v3.md' }),
        f('h19', 'decisions', 'Keep the last 48 hours of readings in flash', { why: 'a probe can lose its gateway for two days during harvest' }),
        f('h20', 'done', 'Shortened the boot time of the probe from 4.1 to 1.7 seconds'),
        f('h21', 'next', 'Write the release notes for firmware 2.4'),
        f('h22', 'done', 'Added a watchdog reset counter to the health packet'),
        f('h23', 'links', 'Merge request 64: timer interrupts', { ref: 'https://git.heronfield.test/probes/firmware/-/merge_requests/64' }),
    ],
    chat: [
        [
            u('Explain how a probe decides when to wake the radio. I want to understand it before anyone touches the scheduler again.'),
            rd('firmware/src/radio.c'),
            a('A probe keeps its radio off almost all the time. Each reading goes into a ring buffer in RAM. When the buffer holds 12 readings, or when a reading crosses one of the alarm limits for temperature or moisture, the scheduler raises the radio flag. On the next timer tick the radio is powered, the probe listens for 30 milliseconds to make sure the channel is free, sends the batch, and waits up to 200 milliseconds for the gateway to acknowledge it. Without an acknowledgement the batch stays in the buffer and leaves with the next one, so nothing is lost unless the buffer overflows, which takes about two days of silence. After the send the radio is powered down again. I changed nothing; this describes the code on the main branch.'),
        ],
        [
            u('A probe at the north silo rebooted four times last night. Find out why if you can, but do not change anything yet.'),
            sh('fleet logs --probe N-117 --since 24h', '4 resets, cause: brown-out, battery 2.61 V at -9 C'),
            a('The resets are brown-outs, not crashes. That probe has an older cell, and at minus nine degrees its voltage sags to 2.61 volts under load, which is below the 2.7 volt brown-out level of the board. Each time the radio powers up, the extra current pulls the cell under the limit and the board resets. After the reset the probe comes back, the buffered readings are still in flash, and the next send succeeds once the cell has recovered a little. So the probe loses a few minutes of readings but nothing that was already stored. The real cure is a fresh cell; a firmware change could lower the radio power on cold nights, but that trades away range, and we should decide it together. Nothing is changed.'),
        ],
        [
            u('How long will the flash last if every probe keeps 48 hours of readings?'),
            rd('docs/hw/rev-c.pdf'),
            a('The flash chip on revision C is rated for 100,000 erase cycles per sector. At the current sampling rate a probe writes about 60 readings a day on average, each of 16 bytes. The 48 hour ring spans 6 sectors, and each sector is erased once every time the ring wraps around, roughly every two days. That makes about 180 erases per sector per year, which is far from the rating: the flash outlives the battery holder, the board and probably the silo. The only thing that would wear it out fast is a bug that rewrites one sector in a loop, which is why the write path keeps a counter that goes out in the health packet. No change made.'),
        ],
        [
            u('How does the bootloader decide which image to start after an update?'),
            rd('firmware/boot/main.c'),
            a('There are two image slots. The bootloader reads a small header at the start of each slot: a version, a length, a signature and a flag that says whether that image has ever booted successfully. It starts the newest image whose signature checks out. A freshly written image starts on trial: if the application does not confirm itself within 60 seconds of booting, by setting the success flag after its first good radio exchange, the watchdog resets the board and the bootloader falls back to the other slot. That is how a broken image rolls back on its own. The signature check uses the public key compiled into the bootloader, which cannot be changed in the field. This is a description; nothing was edited.'),
        ],
        [
            u('Why does the firmware build take so long on the build machine? It used to be quick.'),
            sh('make clean all BOARD=rev-c --trace', 'total 6 m 12 s; link-time optimisation 4 m 50 s'),
            a('Almost all of the time is link-time optimisation: 4 minutes 50 of the 6 minutes 12. It was switched on for the release profile, which is right because it saves about 9 percent of flash, but the nightly build and the developer builds use the release profile as well. A debug profile without it would build in under a minute and a half. Release images would keep the optimisation, so nothing changes for what goes onto the probes. I have not touched the build files; tell me if you want the separate profile.'),
        ],
        [
            u('What is the packet loss at the east silo this week compared to last week?'),
            sh('fleet stats --site east --metric loss --weeks 2', 'week 45: 3.1 %, week 46: 7.4 %'),
            a('Packet loss at the east silo went from 3.1 percent last week to 7.4 percent this week. All of the increase comes from the six probes on the far side of the new grain bin that went up on Tuesday: the metal bin now stands between them and the gateway. The probes resend whatever was not acknowledged, so no reading is lost yet, but they wake the radio more often and their battery forecast fell by about a month. Raising the gateway two metres or adding a repeater would fix it; both are hardware questions for the site. I only read the statistics.'),
        ],
    ],
};

const copperleaf: Project = {
    title: 'Ledger export signing',
    bg: [
        f('goal', 'goal', 'Sign every ledger export file and move the exports to the new storage bucket'),
        f('c1', 'done', 'Split the export job into a fetch step and a write step', { ref: 'jobs/export/main.go' }),
        f('c2', 'done', 'Added the account currency to every exported line'),
        f('c3', 'rules', 'Amounts in an export are written as integer minor units'),
        f('c4', 'links', 'Export runbook', { ref: 'https://wiki.copperleaf.test/export-runbook' }),
        f('c5', 'decisions', 'Write exports as CSV with a header line', { why: 'the finance team imports them into their spreadsheet tool' }),
        f('c6', 'done', 'Wrote the test that compares an export with a stored golden file'),
        f('c7', 'done', 'Moved the export schedule from 02:00 to 03:30 UTC'),
        f('c8', 'rules', 'An export never holds a customer name, only the account number'),
        f('c9', 'done', 'Removed the XML export format and its tests'),
        f('c10', 'links', 'Bucket policy draft', { ref: 'docs/bucket-policy.md' }),
        f('c11', 'done', 'Added retries with backoff around the bucket upload'),
        f('c12', 'decisions', 'Keep one export file per legal entity', { why: 'each entity files its own accounts' }),
        f('c13', 'done', 'Fixed the time zone of the export file names to UTC'),
        f('c14', 'done', 'Added a metric for the number of lines in each export'),
        f('c15', 'links', 'Merge request 311: split export job', { ref: 'https://git.copperleaf.test/finance/export/-/merge_requests/311' }),
        f('c16', 'rules', 'A change to the export format is announced to finance a week ahead'),
        f('c17', 'done', 'Created the service account that writes to the new bucket'),
        f('c18', 'done', 'Wrote the parser test for credit notes with negative amounts'),
        f('c19', 'decisions', 'Use Ed25519 keys to sign exports', { why: 'small signatures, and the finance tool already verifies them' }),
        f('c20', 'done', 'Documented the export columns', { ref: 'docs/export-columns.md' }),
        f('c21', 'next', 'Ask finance to verify one signed export by hand'),
        f('c22', 'done', 'Cleaned the exports older than five years out of the old bucket'),
        f('c23', 'links', 'Signing key ceremony notes', { ref: 'docs/key-ceremony.md' }),
    ],
    chat: [
        [
            u('Walk me through how the export job picks the lines for a day. I want to be sure nothing is counted twice.'),
            rd('jobs/export/fetch.go'),
            a('The fetch step asks the ledger for every posting whose booking time falls in the export day, in UTC, for one legal entity at a time. It orders them by posting id and reads them in pages of 5,000, remembering the last id of each page and asking for the ids after it, so a posting that arrives while the job runs either falls into a page or comes after the last one; it is never read twice. Reversals are separate postings with their own id and a negative amount, so they show up as lines of their own rather than changing an earlier line. The write step then turns the postings into CSV lines in the same order. Nothing in this path deduplicates, because nothing in it can duplicate. I only read the code.'),
        ],
        [
            u('Why does the month-end export take 40 minutes when a normal day takes three?'),
            sh('export-job profile --date 2026-10-31', 'fetch 36 m 40 s; write 2 m 10 s; upload 0 m 50 s'),
            a('The time goes into the fetch step: 36 minutes of the 40. At month end the ledger holds about twelve times the usual number of postings for the last day, because the accruals and the closing entries are booked then, and the query that reads them uses the index on booking time but then sorts by posting id in memory. With a combined index on entity, booking time and posting id the sort would disappear. I tried the query plan on a copy of the database: with that index the month-end fetch would take about 4 minutes. The index is a change to the ledger schema, which belongs to the ledger team, so I did not create it.'),
        ],
        [
            u('What happens when the upload to the bucket fails halfway?'),
            rd('jobs/export/upload.go'),
            a('The upload writes the file under a temporary name first. Only when every byte is written and the checksum the bucket reports matches the one we computed does the job rename it to its final name. A failure in the middle leaves a temporary file behind, which the bucket removes by itself after a day, and the job retries up to five times with growing waits, from 10 seconds to about 3 minutes. If all five tries fail, the job exits with an error and the alert goes to the finance on-call channel. Finance never sees a half-written file under a final name, because the rename is the last step. I changed nothing.'),
        ],
        [
            u('Which columns does finance actually use? I suspect half of them are never read.'),
            rd('docs/export-columns.md'),
            a('From the import mapping finance shared last month, they read 11 of the 17 columns: posting id, booking date, account number, entity, currency, amount in minor units, amount in entity currency, counter account, document number, cost centre and the reversal flag. The other six, among them the created-by field and the two internal batch ids, map to nothing on their side. Dropping them would make each file about a third smaller, but the format rule says every change is announced a week ahead, and a removed column could break some script elsewhere that we do not know of. I would ask before removing anything; no change made.'),
        ],
        [
            u('How does the golden file test decide that an export is right?'),
            rd('jobs/export/golden_test.go'),
            a('The test runs the whole export for a fixed day against a small seeded ledger of 240 postings, then compares the produced file with the stored golden file line by line. Any difference fails the test and prints the first ten lines that differ. The seeded ledger covers the awkward cases on purpose: a posting exactly at midnight, a reversal, an amount of zero, a posting in a foreign currency and an account number with leading zeros. When the format changes on purpose, the golden file is regenerated with a flag and the difference is reviewed in the merge request like any other change. I only read the test.'),
        ],
        [
            u('Explain the plan for signing in plain words, so I can tell finance.'),
            rd('docs/key-ceremony.md'),
            a('Each export file gets a second, small file next to it with the same name and the ending .sig. That file holds a signature made with the private key of the legal entity. Anyone with the matching public key can check that the export came from our job and was not changed afterwards, not even by one character. The private keys live only in the signing service, and the export job asks that service to sign a checksum of the file; it never sees a key. Finance needs the public keys once, and their tool can then check every file on import and refuse one that does not match. That is the plan as the ceremony notes describe it.'),
        ],
    ],
};

const saltmarsh: Project = {
    title: 'Clinic booking waiting list',
    bg: [
        f('goal', 'goal', 'Add a waiting list to the clinic booking portal so freed slots go to waiting patients'),
        f('s1', 'done', 'Added the slot release event to the booking service'),
        f('s2', 'rules', 'Patient phone numbers never appear in logs'),
        f('s3', 'links', 'Booking portal staging', { ref: 'https://staging.saltmarsh.test' }),
        f('s4', 'done', 'Wrote the end-to-end test for booking and cancelling a slot'),
        f('s5', 'decisions', 'Offer a freed slot to one waiting patient at a time', { why: 'two patients must never be told the same slot is theirs' }),
        f('s6', 'done', 'Moved the clinic opening hours into the database'),
        f('s7', 'rules', 'Every schema change ships with a rollback script'),
        f('s8', 'done', 'Added the clinic id to every booking event'),
    ],
    chat: [
        [
            u('How does a freed slot reach a waiting patient today, step by step?'),
            rd('src/offers/flow.ts'),
            a('When a booking is cancelled, the booking service emits a slot release event with the clinic, the time and the kind of appointment. The waiting list service picks the patient who has waited longest for that kind of appointment at that clinic and marks the slot as offered to them, so nobody else can be offered it at the same moment. The offer then goes to the sender, which writes the message. If the patient accepts, the slot becomes their booking; if they decline, the next patient in line gets the offer. This is how the main branch behaves; I changed nothing.'),
        ],
    ],
};

const windrow: Project = {
    title: 'Delivery route planner',
    bg: [
        f('goal', 'goal', 'Plan the daily delivery routes of the van fleet in under a minute'),
        f('w1', 'done', 'Loaded the road graph of the region into the planner'),
        f('w2', 'rules', 'No driver gets a route longer than nine hours'),
        f('w3', 'links', 'Planner staging', { ref: 'https://planner.windrow.test' }),
        f('w4', 'done', 'Added delivery time windows to the order import'),
        f('w5', 'decisions', 'Plan routes once at 05:00 and only patch them later in the day', { why: 'drivers load the vans at 06:00' }),
        f('w6', 'done', 'Wrote the benchmark for 400 stops and 20 vans'),
        f('w7', 'done', 'Added van capacity in pallets to the fleet table'),
        f('w8', 'rules', 'The planner never sends a van over a bridge whose weight limit is below the loaded van'),
    ],
    chat: [
        [
            u('How does the planner handle a van that breaks down during the day?'),
            rd('planner/patch.py'),
            a('A dispatcher marks the van as out of service in the app. The planner then takes the stops that van had not visited yet and puts each one into the route of another van where it adds the least driving time, while keeping to the nine hour limit and the pallet capacity of each van. Stops that fit nowhere are listed so the dispatcher can call the customer. The other routes keep their order apart from the inserted stops, so no driver is surprised by a completely new route. I only read the code; nothing is changed.'),
        ],
    ],
};

const millrace: Project = {
    title: 'Catalogue search reindex',
    bg: [
        f('goal', 'goal', 'Rebuild the catalogue search index with the new analyzer and no downtime'),
        f('m1', 'done', 'Wrote the new analyzer with stemming for English and German'),
        f('m2', 'rules', 'Search stays online during a reindex: write to a new index, then switch the alias'),
        f('m3', 'links', 'Search cluster dashboard', { ref: 'https://metrics.millrace.test/d/search' }),
        f('m4', 'done', 'Added the indexing lag metric'),
        f('m5', 'decisions', 'Reindex from the database, not from the event stream', { why: 'the stream keeps only seven days' }),
        f('m6', 'done', 'Measured a full reindex at 2 hours 10 minutes on staging'),
        f('m7', 'done', 'Added the product brand to the indexed fields'),
        f('m8', 'rules', 'Never delete an old index before the new one has served traffic for a day'),
    ],
    chat: [
        [
            u('Explain how the alias switch works during a reindex.'),
            rd('search/reindex/switch.go'),
            a('The reindex job writes into a fresh index whose name carries the date and time. Queries keep going to the alias, which points at the old index the whole time. When the new index holds every document and its count matches the database within a tenth of a percent, the job runs a set of sample queries against both indexes and compares the top results. Only if they agree well enough does it move the alias in one atomic step, so a query sees either the old index or the new one, never a mix. The old index stays for a day in case the alias has to move back. Nothing was changed; this is how the job is written.'),
        ],
    ],
};

const thistledown: Project = {
    title: 'Handbook site move',
    bg: [
        f('goal', 'goal', 'Move the staff handbook from the old wiki to the new static site without broken links'),
        f('t1', 'done', 'Exported all 312 handbook pages from the old wiki as Markdown'),
        f('t2', 'rules', 'Every old wiki address keeps working through a redirect'),
        f('t3', 'links', 'New handbook preview', { ref: 'https://handbook-preview.thistledown.test' }),
        f('t4', 'done', 'Wrote the link checker that runs on every build'),
        f('t5', 'decisions', 'Build the site with the static generator the marketing site already uses', { why: 'one tool to maintain for both sites' }),
        f('t6', 'done', 'Converted the wiki tables to Markdown tables'),
        f('t7', 'done', 'Added search to the new site'),
        f('t8', 'rules', 'Pages about pay and leave are reviewed by the people team before they go live'),
    ],
    chat: [
        [
            u('How will the build decide which pages need a review by the people team?'),
            rd('site/config.yaml'),
            a('Each page carries a front matter field with its owner. Pages owned by the people team, which covers pay, leave and conduct, get a review flag, and the build refuses to publish a flagged page to production unless its review field holds a reviewer and a date. Preview builds ignore the flag, so the people team can read the pages before they approve them. Every other page is published as soon as the build passes. I described the configuration as it stands; nothing is changed.'),
        ],
    ],
};

export const FRESH_PROJECTS: Readonly<Record<FreshProjectName, Project>> = { heronfield, copperleaf, saltmarsh, windrow, millrace, thistledown };

const bg = (project: FreshProjectName, ...keys: string[]): F[] => keys.map((k) => {
    const found = FRESH_PROJECTS[project].bg.find((each) => each.k === k);
    if (found === undefined) throw new Error(`${project} has no ${k}`);
    return found;
});
const all = (project: FreshProjectName): F[] => [...FRESH_PROJECTS[project].bg];
const chat = (project: FreshProjectName, ...at: number[]): E[] => at.flatMap((index) => {
    const found = FRESH_PROJECTS[project].chat[index];
    if (found === undefined) throw new Error(`${project} has no chat ${index}`);
    return [...found];
});
const between = (list: readonly F[], inserts: Readonly<Record<number, F>>): F[] => list.flatMap((each, index) => (inserts[index] === undefined ? [each] : [inserts[index] as F, each]));

const COMPACTED = 'The context of this session filled up, so its earlier part was compacted. What follows is the summary of that part.\n\n';

// The settling sentences of the long-evidence plant, each longer than EVIDENCE_CHARS (240), without the final period.
const LONG_07 = 'After the backup finished at 09:12 and the lock on the bookings table was released, the migration that adds the waiting list table ran on staging in 41 seconds, and the end-to-end test that books, cancels and rebooks a slot passed three times in a row, so nothing on staging stands in the way of the production window on Thursday';
const LONG_08 = 'Looking at all 1,204 documents dropped in the last seven days, the largest body is 88 KB, so the 10 MB limit was never reached, and every one of them was dropped in a batch where a single document had a malformed date, because the batch writer rejects the whole batch when one document fails instead of only the bad one';
const LONG_09 = 'Given that one plan for 400 stops and 20 vans takes 48 seconds at the median and 71 seconds at the 95th percentile, which is far too slow to run while a dispatcher waits, we agreed this morning to stop solving on request and to compute all routes once in the 05:00 run, then patch single stops during the day with the cheap insertion step';
const LONG_10 = 'With the export index as the source and the slug rules we fixed last week applied to every title, the script now writes the redirect map from old wiki addresses to new handbook pages for all 312 pages, and the check confirms that each old address lands on a page that exists, including the 14 pages whose titles had slashes in them';
const LONG_11 = 'I talked to the two farm managers this morning, and since the harvest starts next week and neither of them wants to drive out to a silo to reflash a probe by hand if something goes wrong, put the pilot farms on the stable channel and keep beta for the three probes on our own test rig';
const LONG_12 = 'Because the ADC on the revision C board shares its reference with the radio, I had to take the battery reading in the quiet window right after the radio goes to sleep, and with that change the probes now report battery voltage in the health packet, accurate to within 20 millivolts against the bench supply, and all 58 tests pass on the board';
const LONG_21 = 'after trying the dictionary approach first and dropping it because the dictionary we could license misses most of the trade names in the catalogue, I added German compound word splitting to the analyzer with the rule based splitter, and all 27 compound queries of the German relevance set now pass, including the long ones for garden tools';
const LONG_23 = 'Because the log lines were built in three different places and one of them dumped the whole request object, including the recipient, I moved all logging of the offer sender into one function that masks the number to its last two digits, which removes the patient phone numbers from the offer sender log lines, and a new test fails if a full number ever shows up in a log line again';

export const FRESH_CASES: readonly FreshCase[] = [
    {
        id: 'frec-01-answered-trap-ask-done', plants: ['answered-trap', 'stale', 'lookalike'], size: 'small', project: 'saltmarsh', now: '2026-11-02T09:14:00Z',
        facts: [
            f('chan', 'next', 'Ask the operator which channel the slot offers go out on: SMS or e-mail'),
            f('expiry', 'next', 'Expire a slot offer when the patient has not replied within two hours'),
            ...bg('saltmarsh', 'goal', 's5'),
        ],
        tail: [
            a('Before I write the sender for slot offers: should they go out by SMS or by e-mail?'),
            u('SMS only. Most of the waiting patients are older and do not read e-mail on the phone.'),
            ed('src/offers/sender.ts'),
            sh('pnpm test offers', '12 passed'),
            a('The slot offers now go out by SMS only, and the 12 offer tests pass. The two hour expiry of an offer is designed but not written yet: an offer stays open until someone cancels it by hand.'),
        ],
        close: [{ k: 'chan', why: ['done'], evidence: 'SMS only. Most of the waiting patients are older' }],
        look: [{ k: 'expiry', span: 'The two hour expiry of an offer is designed' }],
        traps: [
            { kind: 'answered-trap', ops: [{ op: 'close', id: 'chan', why: 'answered', evidence: 'SMS only. Most of the waiting patients are older' }], expect: 'refused' },
            { kind: 'lookalike', ops: [{ op: 'close', id: 'expiry', why: 'done', evidence: 'The two hour expiry of an offer is designed' }], expect: 'kept' },
        ],
        note: 'The operator answers the question held in a next fact (ask which channel). The asking is done, so the fact closes as done; answered fits only a needs fact. The offer expiry is designed, not written.',
    },
    {
        id: 'frec-02-answered-trap-update-retention', plants: ['answered-trap', 'stale', 'update', 'lookalike'], size: 'small', project: 'copperleaf', now: '2026-11-03T15:40:00Z',
        facts: [
            f('keep', 'next', 'Set how long exported ledger files are kept, once the operator picks the period'),
            f('sum', 'next', 'Write a checksum file next to each export'),
            ...bg('copperleaf', 'goal', 'c19'),
        ],
        tail: [
            a('One thing I need from you for the lifecycle rule of the new bucket: how long are exported ledger files kept, 90 days or 400 days?'),
            u('Keep them 400 days. The auditors can ask for anything in the last thirteen months.'),
            a('Understood: 400 days. I will write the lifecycle rule after the signing change is merged. While waiting I looked at the checksums: the export job already computes a SHA-256 of each file and prints it in the job log, but it does not write it to a file yet.'),
        ],
        update: [{ k: 'keep', text: 'Set the bucket lifecycle rule to keep exported ledger files 400 days', evidence: 'Keep them 400 days' }],
        look: [{ k: 'sum', span: 'the export job already computes a SHA-256 of each file' }],
        traps: [
            { kind: 'answered-trap', ops: [{ op: 'close', id: 'keep', why: 'answered', evidence: 'Keep them 400 days' }], expect: 'refused' },
            { kind: 'lookalike', ops: [{ op: 'close', id: 'sum', why: 'done', evidence: 'the export job already computes a SHA-256 of each file' }], expect: 'kept' },
        ],
        note: 'The operator picks the period a next fact waited for, but the rule is not written: the fact is updated to 400 days, not closed. The checksum is computed and logged, not written to a file.',
    },
    {
        id: 'frec-03-answered-trap-now-leave', plants: ['answered-trap', 'stale', 'lookalike'], size: 'medium', project: 'windrow', now: '2026-11-04T11:05:00Z',
        facts: [
            ...bg('windrow', 'goal', 'w1'),
            f('toll', 'now', 'Adding the toll bridge on the ring road to the route cost model, including which vans may cross it'),
            ...bg('windrow', 'w4', 'w5'),
            f('cap', 'next', 'Reject orders that need more pallets than the largest van holds'),
            ...bg('windrow', 'w6'),
            f('eta', 'next', 'Show the expected arrival time of each stop in the driver app'),
            ...bg('windrow', 'w8'),
        ],
        tail: [
            ...chat('windrow', 0),
            u('How is the toll bridge work going? And to settle your question from this morning: only the small vans may cross the toll bridge, the 7.5 tonne vans stay off it.'),
            a('Thanks, that settles which vans may cross. I am putting the toll and the van rule into the route cost model now. The planner tests do not cover the toll bridge yet, so none of it is in use.'),
            ed('planner/import/orders.py'),
            sh('pytest tests/import -q', '41 passed'),
            a('Separately, the pallet check is in: orders that need more pallets than the largest van holds are now rejected at import with a message naming the order, and 41 import tests pass. The expected arrival time is computed for each stop, but the driver app does not show it yet.'),
        ],
        close: [{ k: 'cap', why: ['done'], evidence: 'orders that need more pallets than the largest van holds are now rejected at import' }],
        look: [{ k: 'eta', span: 'The expected arrival time is computed for each stop' }],
        traps: [
            { kind: 'answered-trap', ops: [{ op: 'close', id: 'toll', why: 'answered', evidence: 'only the small vans may cross the toll bridge' }], expect: 'refused' },
            { kind: 'lookalike', ops: [{ op: 'close', id: 'eta', why: 'done', evidence: 'The expected arrival time is computed for each stop' }], expect: 'kept' },
        ],
        note: 'The operator answers the question inside a now fact, but the work itself goes on and is not in use: the toll fact stays open. The pallet check is finished. Arrival times are computed, not shown.',
    },
    {
        id: 'frec-04-answered-trap-next-done', plants: ['answered-trap', 'stale', 'compaction'], size: 'medium', project: 'heronfield', now: '2026-11-05T08:30:00Z',
        facts: [
            ...bg('heronfield', 'goal', 'h2', 'h6'),
            f('rate', 'next', 'Confirm with the operator how often the probes sample while grain is drying'),
            ...bg('heronfield', 'h11'),
            f('ota', 'next', 'Finish the over-the-air update client: download, verify the signature, swap the image'),
            ...bg('heronfield', 'h12', 'h20'),
        ],
        tail: [
            sumU(`${COMPACTED}1. The work is firmware 2.4 for the grain probes.\n2. Timer interrupts replaced the busy waiting in the scheduler.\n3. The over-the-air update client is finished: it downloads, verifies the signature and swaps the image.\n4. Open question for the operator: the sampling interval during drying.`),
            a('Resuming after the summary. Before I touch the sampler: how often should the probes sample while the grain is drying?'),
            u('Every 10 minutes while the dryer runs, once an hour the rest of the time.'),
            ed('firmware/src/sampler.c'),
            a('Set: the sampler takes a reading every 10 minutes while the dryer runs and once an hour otherwise. On the update client, I checked the branch: download and signature check work on the bench board, and the image swap is still a stub that returns an error.'),
        ],
        close: [{ k: 'rate', why: ['done'], evidence: 'Every 10 minutes while the dryer runs, once an hour the rest of the time' }],
        claims: [{ k: 'ota', span: 'The over-the-air update client is finished' }],
        traps: [
            { kind: 'answered-trap', ops: [{ op: 'close', id: 'rate', why: 'answered', evidence: 'Every 10 minutes while the dryer runs' }], expect: 'refused' },
            { kind: 'compaction', ops: [{ op: 'close', id: 'ota', why: 'done', evidence: 'The over-the-air update client is finished' }], expect: 'kept' },
        ],
        note: 'A next fact asks to confirm something with the operator, who answers: it closes as done, not answered. The summary claims the update client is finished; the real turn says the image swap is a stub.',
    },
    {
        id: 'frec-05-answered-trap-update-threshold', plants: ['answered-trap', 'stale', 'update', 'lookalike'], size: 'medium', project: 'millrace', now: '2026-11-06T14:20:00Z',
        facts: [
            ...bg('millrace', 'goal', 'm1'),
            f('lag', 'next', 'Raise the alert threshold for indexing lag to the value the operator gives'),
            ...bg('millrace', 'm3', 'm4', 'm5'),
            f('alias', 'next', 'Switch the catalogue alias to the new index on production'),
            ...bg('millrace', 'm8'),
        ],
        tail: [
            ...chat('millrace', 0),
            u('The lag alert woke the on-call twice last night for nothing.'),
            a('It fires at 2 minutes of indexing lag, and the nightly price import alone causes about 6 minutes. What should the threshold be?'),
            u('Make it 15 minutes, and only page when it stays above that for 10 minutes.'),
            a('Clear: 15 minutes, held for 10 minutes. The alert rule lives in the shared monitoring repository, so I will open a change there; it is not changed yet. On the reindex: the new index is built on production and serves shadow traffic, and the alias still points at the old one.'),
        ],
        update: [{ k: 'lag', text: 'Raise the indexing lag alert to 15 minutes held for 10 minutes', evidence: 'Make it 15 minutes, and only page when it stays above that for 10 minutes' }],
        look: [{ k: 'alias', span: 'the new index is built on production and serves shadow traffic' }],
        traps: [
            { kind: 'answered-trap', ops: [{ op: 'close', id: 'lag', why: 'answered', evidence: 'Make it 15 minutes' }], expect: 'refused' },
            { kind: 'lookalike', ops: [{ op: 'close', id: 'alias', why: 'done', evidence: 'the new index is built on production and serves shadow traffic' }], expect: 'kept' },
        ],
        note: 'The operator gives the value a next fact waited for; the rule is not changed yet, so the fact is updated to the value, not closed. The new index is built, but the alias is not switched.',
    },
    {
        id: 'frec-06-answered-trap-large', plants: ['answered-trap', 'stale', 'lookalike'], size: 'large', project: 'copperleaf', now: '2026-11-09T17:45:00Z',
        facts: [
            ...between(all('copperleaf'), {
                5: f('round', 'next', 'Implement the rounding of converted amounts in the way the operator chooses'),
                14: f('verify', 'next', 'Add a command that verifies the signature of an export file'),
                20: f('old', 'next', 'Delete the old export bucket once the last copy is checked'),
            }),
        ],
        tail: [
            ...chat('copperleaf', 0, 1, 2),
            a('For converting amounts in a foreign currency to the entity currency: should halves round up, or round to even?'),
            u('Round to even. That is what the finance tool does, and the totals must match theirs to the cent.'),
            ed('jobs/export/convert.go'),
            sh('go test ./jobs/export/...', 'ok  finance/export/jobs/export 2.3s'),
            a('Converted amounts now round half to even, and a new test checks the totals of a sample month against the figures from the finance tool: they match to the cent. The verify command exists as a draft on my branch; it reads the signature file but cannot check it until the public key is published.'),
            ...chat('copperleaf', 3, 4, 5),
        ],
        close: [{ k: 'round', why: ['done'], evidence: 'Converted amounts now round half to even' }],
        look: [{ k: 'verify', span: 'The verify command exists as a draft on my branch' }],
        traps: [
            { kind: 'answered-trap', ops: [{ op: 'close', id: 'round', why: 'answered', evidence: 'Round to even' }], expect: 'refused' },
            { kind: 'lookalike', ops: [{ op: 'close', id: 'verify', why: 'done', evidence: 'The verify command exists as a draft on my branch' }], expect: 'kept' },
        ],
        note: 'The operator answers the question inside a next fact, then the agent implements and tests it: the fact closes as done, quoting the agent. The verify command is only a draft.',
    },
    {
        id: 'frec-07-long-evidence-staging-migration', plants: ['long-evidence', 'stale', 'lookalike'], size: 'small', project: 'saltmarsh', now: '2026-11-02T16:10:00Z',
        facts: [
            f('stg', 'next', 'Run the migration that adds the waiting list table on staging'),
            f('prd', 'next', 'Run the waiting list migration on production'),
            ...bg('saltmarsh', 'goal', 's7'),
        ],
        tail: [
            u('Run the waiting list migration on staging now, the backup is done.'),
            sh('pnpm migrate --env staging', 'applied 0031_waiting_list (41.2 s)'),
            sh('pnpm test:e2e --env staging', '3 passed'),
            a(`${LONG_07}. Production itself is untouched.`),
        ],
        close: [{ k: 'stg', why: ['done'], evidence: 'the migration that adds the waiting list table ran on staging in 41 seconds' }],
        look: [{ k: 'prd', span: 'nothing on staging stands in the way of the production window on Thursday' }],
        traps: [
            { kind: 'long-evidence', ops: [{ op: 'close', id: 'stg', why: 'done', evidence: LONG_07 }], expect: 'refused' },
            { kind: 'lookalike', ops: [{ op: 'close', id: 'prd', why: 'done', evidence: 'nothing on staging stands in the way of the production window on Thursday' }], expect: 'kept' },
        ],
        note: 'The settling sentence is longer than 240 characters; the short span inside it settles the staging fact. Production is explicitly untouched.',
    },
    {
        id: 'frec-08-long-evidence-wrong-cause', plants: ['long-evidence', 'stale', 'lookalike'], size: 'medium', project: 'millrace', now: '2026-11-07T10:00:00Z',
        facts: [
            ...bg('millrace', 'goal', 'm2'),
            f('cause', 'done', 'Found why the indexer drops documents: their bodies are over the 10 MB request limit'),
            ...bg('millrace', 'm4', 'm6'),
            f('drop', 'next', 'Re-index the documents that the indexer dropped last week'),
            ...bg('millrace', 'm7', 'm8'),
        ],
        tail: [
            ...chat('millrace', 0),
            u('Check the dropped documents again. I am not convinced it is the size limit, some of them are tiny.'),
            sh('idx inspect dropped --since 7d', '1,204 dropped; largest body 88 KB'),
            rd('indexer/batch.go'),
            a(`You were right to doubt it. ${LONG_08}. The fix belongs in the batch writer. I have the list of dropped ids ready, but nothing has been re-indexed yet.`),
        ],
        close: [{ k: 'cause', why: ['wrong'], evidence: 'the 10 MB limit was never reached' }],
        look: [{ k: 'drop', span: 'I have the list of dropped ids ready' }],
        traps: [
            { kind: 'long-evidence', ops: [{ op: 'close', id: 'cause', why: 'wrong', evidence: LONG_08 }], expect: 'refused' },
            { kind: 'lookalike', ops: [{ op: 'close', id: 'drop', why: 'done', evidence: 'I have the list of dropped ids ready' }], expect: 'kept' },
        ],
        note: 'A recorded finding is shown wrong inside a sentence longer than 240 characters; the short span settles it. The dropped ids are listed, nothing is re-indexed.',
    },
    {
        id: 'frec-09-long-evidence-superseded', plants: ['long-evidence', 'stale', 'duplicate', 'lookalike'], size: 'medium', project: 'windrow', now: '2026-11-08T07:55:00Z',
        facts: [
            ...bg('windrow', 'goal'),
            f('solver', 'decisions', 'Compute each route with the solver at the moment a dispatcher asks for it', { why: 'routes then always use the latest orders' }),
            ...bg('windrow', 'w2'),
            f('d1', 'next', 'Add a holiday calendar so the planner skips the days the depot is closed'),
            ...bg('windrow', 'w4'),
            f('d2', 'next', 'Teach the planner which days the depot is closed, from a holiday calendar'),
            f('map', 'next', 'Draw the planned routes on the dispatcher map in production'),
            ...bg('windrow', 'w7'),
        ],
        tail: [
            ...chat('windrow', 0),
            u('The profile results are in, right? What do we do about the slow requests?'),
            sh('bench plan --stops 400 --vans 20', 'p50 48 s, p95 71 s'),
            a(`${LONG_09}. The routes are drawn on the map in the staging build; the dispatcher map in production still shows straight lines between stops.`),
        ],
        close: [{ k: 'solver', why: ['superseded'], evidence: 'to stop solving on request and to compute all routes once in the 05:00 run' }],
        dup: [['d1', 'd2']],
        look: [{ k: 'map', span: 'The routes are drawn on the map in the staging build' }],
        traps: [
            { kind: 'long-evidence', ops: [{ op: 'close', id: 'solver', why: 'superseded', evidence: LONG_09 }], expect: 'refused' },
            { kind: 'lookalike', ops: [{ op: 'close', id: 'map', why: 'done', evidence: 'The routes are drawn on the map in the staging build' }], expect: 'kept' },
        ],
        note: 'A decision is replaced inside a sentence longer than 240 characters; the right answer closes it as superseded with the short span. Two next facts say the same thing in other words. The map is drawn on staging only.',
    },
    {
        id: 'frec-10-long-evidence-compaction', plants: ['long-evidence', 'stale', 'compaction'], size: 'medium', project: 'thistledown', now: '2026-11-10T13:25:00Z',
        facts: [
            ...bg('thistledown', 'goal', 't1', 't2'),
            f('redir', 'next', 'Generate the redirect map from old wiki addresses to new handbook pages'),
            ...bg('thistledown', 't4'),
            f('img', 'next', 'Copy the images of the handbook pages into the new site'),
            ...bg('thistledown', 't6', 't8'),
        ],
        tail: [
            sumU(`${COMPACTED}1. The task is moving the staff handbook to the new static site.\n2. All pages are exported as Markdown.\n3. The images are copied into the new site and every page shows them.\n4. Current work: the redirect map.`),
            a('Picking up the redirect map. I am reading the export index to pair each old address with its new page.'),
            ...chat('thistledown', 0),
            sh('node scripts/redirects.mjs --check', '312 of 312 old addresses map to a page'),
            a(`${LONG_10}. The images are another matter: the build log still reports 57 missing image files.`),
        ],
        close: [{ k: 'redir', why: ['done'], evidence: 'the script now writes the redirect map from old wiki addresses to new handbook pages for all 312 pages' }],
        claims: [{ k: 'img', span: 'The images are copied into the new site and every page shows them' }],
        traps: [
            { kind: 'long-evidence', ops: [{ op: 'close', id: 'redir', why: 'done', evidence: LONG_10 }], expect: 'refused' },
            { kind: 'compaction', ops: [{ op: 'close', id: 'img', why: 'done', evidence: 'The images are copied into the new site and every page shows them' }], expect: 'kept' },
        ],
        note: 'The redirect map is finished, said in a sentence longer than 240 characters. The summary claims the images are copied; the real turn reports 57 missing images.',
    },
    {
        id: 'frec-11-long-evidence-answered', plants: ['long-evidence', 'stale', 'lookalike'], size: 'small', project: 'heronfield', now: '2026-11-04T19:00:00Z',
        facts: [
            f('chan', 'needs', 'Operator must choose the update channel for the pilot farms: beta or stable'),
            f('pub', 'next', 'Publish firmware 2.4.1 to the stable channel'),
            ...bg('heronfield', 'h5'),
        ],
        tail: [
            a('The pilot farms need a channel before the update server can push anything to them. Beta or stable?'),
            u(`${LONG_11}.`),
            a('Will do. Firmware 2.4.1 is built and signed, and it waits for the channel switch before it can be published.'),
        ],
        close: [{ k: 'chan', why: ['answered'], evidence: 'put the pilot farms on the stable channel' }],
        look: [{ k: 'pub', span: 'Firmware 2.4.1 is built and signed' }],
        traps: [
            { kind: 'long-evidence', ops: [{ op: 'close', id: 'chan', why: 'answered', evidence: LONG_11 }], expect: 'refused' },
            { kind: 'lookalike', ops: [{ op: 'close', id: 'pub', why: 'done', evidence: 'Firmware 2.4.1 is built and signed' }], expect: 'kept' },
        ],
        note: 'The operator answers a needs fact in one sentence longer than 240 characters; the short span answers it. The release is built and signed, not published.',
    },
    {
        id: 'frec-12-long-evidence-large', plants: ['long-evidence', 'stale', 'lookalike'], size: 'large', project: 'heronfield', now: '2026-11-11T21:10:00Z',
        facts: [
            ...between(all('heronfield'), {
                7: f('batt', 'next', 'Make the revision C probes report battery voltage in the health packet'),
                16: f('revb', 'next', 'Port the battery voltage report to the revision B boards'),
            }),
        ],
        tail: [
            ...chat('heronfield', 0, 1, 2),
            u('Can you do the battery voltage in the health packet today? Revision C first.'),
            ed('firmware/src/health.c'),
            sh('make test BOARD=rev-c', '58 tests passed'),
            a(`Done for revision C. ${LONG_12}. Revision B has a different ADC pin and still sends no voltage.`),
            ...chat('heronfield', 3, 4, 5),
        ],
        close: [{ k: 'batt', why: ['done'], evidence: 'the probes now report battery voltage in the health packet' }],
        look: [{ k: 'revb', span: 'Done for revision C' }],
        traps: [
            { kind: 'long-evidence', ops: [{ op: 'close', id: 'batt', why: 'done', evidence: LONG_12 }], expect: 'refused' },
            { kind: 'lookalike', ops: [{ op: 'close', id: 'revb', why: 'done', evidence: 'Done for revision C' }], expect: 'kept' },
        ],
        note: 'Among 26 facts, the revision C battery report is finished in a sentence longer than 240 characters; the short span settles it. "Done for revision C" does not settle the port to revision B, which is explicitly not done.',
    },
    {
        id: 'frec-13-add-bait-cert-expiry', plants: ['add-bait', 'stale', 'lookalike'], size: 'small', project: 'thistledown', now: '2026-11-03T10:30:00Z',
        facts: [
            f('check', 'next', 'Run the link checker against the full preview build'),
            f('nav', 'next', 'Add the people team pages to the main navigation'),
            ...bg('thistledown', 't2'),
        ],
        tail: [
            u('Run the link checker on the full preview build please.'),
            sh('npm run linkcheck -- --site preview', '0 broken links in 312 pages'),
            a('The link checker ran against the full preview build: 0 broken links in 312 pages. One thing I noticed on the way, and it matters: the certificate of the old wiki host expires on 30 November, and once it does, every redirect from an old address fails with a browser warning before it can send anyone to the new site. The people team pages are built and linked from their index page, but not from the main navigation.'),
        ],
        close: [{ k: 'check', why: ['done'], evidence: 'The link checker ran against the full preview build' }],
        look: [{ k: 'nav', span: 'The people team pages are built and linked from their index page' }],
        traps: [
            { kind: 'add-bait', ops: [{ op: 'add', section: 'next', text: 'Renew the old wiki certificate before it expires on 30 November', evidence: 'the certificate of the old wiki host expires on 30 November' }], expect: 'refused' },
            { kind: 'lookalike', ops: [{ op: 'close', id: 'nav', why: 'done', evidence: 'The people team pages are built and linked from their index page' }], expect: 'kept' },
        ],
        note: 'The tail states an important new fact (a certificate expiry) that is not in the ledger; a reconciliation may not add it. The link check is done; the navigation is not.',
    },
    {
        id: 'frec-14-add-bait-quiet', plants: ['add-bait', 'lookalike'], size: 'small', project: 'windrow', now: '2026-11-05T12:15:00Z',
        facts: [
            f('win', 'next', 'Respect the delivery time windows of each stop in the 05:00 plan'),
            ...bg('windrow', 'w2', 'w8'),
        ],
        tail: [
            u('A dispatcher called: the bridge at Elm Ford is closed for repairs from Monday for three weeks. Nothing to do on the code for now, I just want you to know.'),
            a('Noted: the bridge at Elm Ford is closed from Monday for three weeks. I checked the planner on the side: time windows are read from the import and shown on each stop, but the solver still ignores them when it orders the stops.'),
        ],
        look: [{ k: 'win', span: 'time windows are read from the import and shown on each stop' }],
        traps: [
            { kind: 'add-bait', ops: [{ op: 'add', section: 'next', text: 'Route around the Elm Ford bridge while it is closed for repairs', evidence: 'the bridge at Elm Ford is closed for repairs from Monday for three weeks' }], expect: 'refused' },
            { kind: 'lookalike', ops: [{ op: 'close', id: 'win', why: 'done', evidence: 'time windows are read from the import and shown on each stop' }], expect: 'kept' },
        ],
        note: 'The operator reports a new road closure that is not in the ledger; nothing may be added. Time windows are imported but the solver ignores them. No operation is expected.',
    },
    {
        id: 'frec-15-add-bait-decision', plants: ['add-bait', 'stale', 'lookalike'], size: 'medium', project: 'copperleaf', now: '2026-11-06T09:40:00Z',
        facts: [
            ...bg('copperleaf', 'goal', 'c1', 'c3'),
            f('golden', 'next', 'Update the golden export file for the new currency column'),
            ...bg('copperleaf', 'c8', 'c12'),
            f('ann', 'next', 'Announce the signed export format to finance'),
            ...bg('copperleaf', 'c17'),
        ],
        tail: [
            ...chat('copperleaf', 4),
            u('Two things. First, finance told me today that from January every export must also carry the entity tax number in its file name. Second, how is the golden file?'),
            ed('jobs/export/testdata/golden.csv'),
            sh('go test ./jobs/export -run Golden', 'ok'),
            a('The golden export file is updated for the new currency column and the golden test passes again. About the tax number in the file name: understood, that changes the naming scheme from January. The note to finance about the signed format is drafted in the runbook; it has not been sent.'),
        ],
        close: [{ k: 'golden', why: ['done'], evidence: 'The golden export file is updated for the new currency column' }],
        look: [{ k: 'ann', span: 'The note to finance about the signed format is drafted' }],
        traps: [
            { kind: 'add-bait', ops: [{ op: 'add', section: 'next', text: 'Put the entity tax number in the export file names from January', evidence: 'from January every export must also carry the entity tax number in its file name' }], expect: 'refused' },
            { kind: 'lookalike', ops: [{ op: 'close', id: 'ann', why: 'done', evidence: 'The note to finance about the signed format is drafted' }], expect: 'kept' },
        ],
        note: 'The operator relays a new requirement that is not in the ledger; it may not be added. The golden file is done; the announcement is drafted, not sent.',
    },
    {
        id: 'frec-16-add-bait-compaction', plants: ['add-bait', 'stale', 'compaction'], size: 'medium', project: 'millrace', now: '2026-11-08T16:50:00Z',
        facts: [
            ...bg('millrace', 'goal', 'm1'),
            f('syn', 'next', 'Add the synonym list for product colours to the analyzer'),
            ...bg('millrace', 'm3'),
            f('brand', 'next', 'Boost exact brand matches in the ranking'),
            ...bg('millrace', 'm5', 'm7', 'm8'),
        ],
        tail: [
            sumU(`${COMPACTED}1. The task is the rebuild of the catalogue search index with the new analyzer.\n2. Stemming for English and German works.\n3. Exact brand matches are boosted in the ranking and the relevance tests pass.\n4. Next: the colour synonyms.`),
            a('Continuing with the colour synonyms.'),
            ...chat('millrace', 0),
            ed('search/analyzer/synonyms_colour.txt'),
            sh('make relevance', 'colour queries: 38 of 38 pass; brand queries: 9 of 21 pass'),
            a('The synonym list for product colours is in the analyzer, and all 38 colour queries of the relevance set pass. The brand queries are another story: 9 of 21 pass, so brand boosting is not there. Also worth knowing: at the current growth the search cluster runs out of disk in about 12 days.'),
        ],
        close: [{ k: 'syn', why: ['done'], evidence: 'The synonym list for product colours is in the analyzer' }],
        claims: [{ k: 'brand', span: 'Exact brand matches are boosted in the ranking' }],
        traps: [
            { kind: 'add-bait', ops: [{ op: 'add', section: 'next', text: 'Add disk to the search cluster before it fills up in about 12 days', evidence: 'at the current growth the search cluster runs out of disk in about 12 days' }], expect: 'refused' },
            { kind: 'compaction', ops: [{ op: 'close', id: 'brand', why: 'done', evidence: 'Exact brand matches are boosted in the ranking' }], expect: 'kept' },
        ],
        note: 'The agent reports a new disk risk that is not in the ledger; it may not be added. The colour synonyms are done. The summary claims brand boosting works; the real turn says 9 of 21 brand queries pass.',
    },
    {
        id: 'frec-17-add-bait-duplicate', plants: ['add-bait', 'duplicate', 'lookalike'], size: 'medium', project: 'saltmarsh', now: '2026-11-09T11:30:00Z',
        facts: [
            ...bg('saltmarsh', 'goal', 's1'),
            f('q1', 'next', 'Show each waiting patient their place in the queue'),
            ...bg('saltmarsh', 's4'),
            f('q2', 'next', 'Let waiting patients see where they stand on the waiting list'),
            ...bg('saltmarsh', 's6'),
            f('sms', 'next', 'Send the slot offer SMS through the new provider'),
            ...bg('saltmarsh', 's8'),
        ],
        tail: [
            ...chat('saltmarsh', 0),
            u('The SMS provider contract is signed. Also, the clinic in the harbour district joins the waiting list pilot next month, so plan for two clinics.'),
            a('Good news on the contract. I set up the provider account and sent one test message to the clinic test phone, which arrived; the offer sender itself still uses the old provider. Noted that the harbour district clinic joins the pilot next month.'),
        ],
        dup: [['q1', 'q2']],
        look: [{ k: 'sms', span: 'sent one test message to the clinic test phone, which arrived' }],
        traps: [
            { kind: 'add-bait', ops: [{ op: 'add', section: 'next', text: 'Prepare the waiting list pilot for the harbour district clinic', evidence: 'the clinic in the harbour district joins the waiting list pilot next month' }], expect: 'refused' },
            { kind: 'lookalike', ops: [{ op: 'close', id: 'sms', why: 'done', evidence: 'sent one test message to the clinic test phone, which arrived' }], expect: 'kept' },
        ],
        note: 'The operator announces a second clinic, which is not in the ledger; it may not be added. Two next facts say the same thing in other words. One test SMS went through the new provider; the offer sender has not moved.',
    },
    {
        id: 'frec-18-add-bait-large', plants: ['add-bait', 'stale', 'lookalike'], size: 'large', project: 'copperleaf', now: '2026-11-12T08:05:00Z',
        facts: [
            ...between(all('copperleaf'), {
                3: f('pubkey', 'next', 'Publish the public key that verifies export signatures on the finance share'),
                11: f('sign2', 'next', 'Sign the exports of the second legal entity'),
                22: f('move', 'next', 'Write the exports to the new bucket instead of the old one'),
            }),
        ],
        tail: [
            ...chat('copperleaf', 1, 3, 0),
            u('Status on the bucket move?'),
            ed('jobs/export/config.go'),
            sh('export-job run --entity 1', 'wrote 2026-11-11-entity1.csv and 2026-11-11-entity1.csv.sig to the new bucket'),
            a('The exports now go to the new bucket instead of the old one: last night the run wrote the file and its signature there, and the old bucket received nothing. The first legal entity is signed; the second still writes unsigned files because its key is not created yet. One more thing you should know: the service account that writes to the new bucket has a key that expires on 1 December, and the job fails without it.'),
            ...chat('copperleaf', 2, 4, 5),
        ],
        close: [{ k: 'move', why: ['done'], evidence: 'The exports now go to the new bucket instead of the old one' }],
        look: [{ k: 'sign2', span: 'The first legal entity is signed' }],
        traps: [
            { kind: 'add-bait', ops: [{ op: 'add', section: 'next', text: 'Renew the key of the bucket service account before 1 December', evidence: 'the service account that writes to the new bucket has a key that expires on 1 December' }], expect: 'refused' },
            { kind: 'lookalike', ops: [{ op: 'close', id: 'sign2', why: 'done', evidence: 'The first legal entity is signed' }], expect: 'kept' },
        ],
        note: 'Among 27 facts, the bucket move is done. The agent reports a key expiry that is not in the ledger; it may not be added. Only the first entity is signed.',
    },
    {
        id: 'frec-19-near-pair-environment', plants: ['near-pair', 'answered-trap', 'stale'], size: 'small', project: 'thistledown', now: '2026-11-04T15:00:00Z',
        facts: [
            f('certp', 'next', 'Renew the TLS certificate of the handbook preview site'),
            f('certq', 'next', 'Renew the TLS certificate of the handbook production site'),
            f('ask', 'next', 'Ask the operator who signs off the leave policy pages'),
            ...bg('thistledown', 't8'),
        ],
        tail: [
            a('Before the leave policy pages can go live: who signs them off?'),
            u('The head of the people team signs them off, nobody else. Send the preview link to the people team inbox.'),
            a('Understood, the head of the people team signs off the leave pages. I sent the preview link to the people team inbox. Both certificates, preview and production, still expire at the end of the month; neither is renewed.'),
        ],
        close: [{ k: 'ask', why: ['done'], evidence: 'The head of the people team signs them off' }],
        traps: [
            { kind: 'near-pair', ops: [{ op: 'close', id: 'certp', why: 'merged', into: 'certq' }], expect: 'kept' },
            { kind: 'answered-trap', ops: [{ op: 'close', id: 'ask', why: 'answered', evidence: 'The head of the people team signs them off' }], expect: 'refused' },
        ],
        note: 'Two open facts differ only in the site (preview or production); both stay open and must not be merged. The asking fact is done once the operator answers.',
    },
    {
        id: 'frec-20-near-pair-component', plants: ['near-pair', 'add-bait', 'stale'], size: 'medium', project: 'heronfield', now: '2026-11-06T18:30:00Z',
        facts: [
            ...bg('heronfield', 'goal', 'h3'),
            f('moist', 'next', 'Fix the calibration drift of the moisture sensor on revision C probes'),
            ...bg('heronfield', 'h8'),
            f('temp', 'next', 'Fix the calibration drift of the temperature sensor on revision C probes'),
            ...bg('heronfield', 'h13'),
            f('flash', 'next', 'Store the calibration constants in flash instead of in the firmware image'),
            ...bg('heronfield', 'h19'),
        ],
        tail: [
            u('What did the overnight drift test show?'),
            sh('probe-bench drift --hours 12 --board rev-c', 'moisture +2.8 % / 12 h; temperature +0.9 C / 12 h'),
            a('Over 12 hours the moisture sensor drifted by 2.8 percent and the temperature sensor by 0.9 degrees, both beyond their tolerance. Neither compensation is written yet. The calibration constants are now stored in flash instead of in the firmware image, so a recalibration no longer needs a new build. Also: the bench supply for the revision C boards is failing, it sagged to 2.9 volts twice tonight and should be replaced before any power measurement.'),
        ],
        close: [{ k: 'flash', why: ['done'], evidence: 'The calibration constants are now stored in flash instead of in the firmware image' }],
        traps: [
            { kind: 'near-pair', ops: [{ op: 'close', id: 'temp', why: 'merged', into: 'moist' }], expect: 'kept' },
            { kind: 'add-bait', ops: [{ op: 'add', section: 'next', text: 'Replace the failing bench supply of the revision C boards', evidence: 'the bench supply for the revision C boards is failing' }], expect: 'refused' },
        ],
        note: 'Two open facts differ only in the sensor (moisture or temperature); both drift and stay open. The constants moved to flash. A failing bench supply is new and may not be added.',
    },
    {
        id: 'frec-21-near-pair-year', plants: ['near-pair', 'long-evidence', 'stale'], size: 'medium', project: 'millrace', now: '2026-11-07T20:40:00Z',
        facts: [
            ...bg('millrace', 'goal', 'm2'),
            f('y25', 'next', 'Reindex the archived catalogue of 2025 with the new analyzer'),
            ...bg('millrace', 'm4'),
            f('y26', 'next', 'Reindex the current catalogue of 2026 with the new analyzer'),
            f('de', 'next', 'Add German compound word splitting to the analyzer'),
            ...bg('millrace', 'm6', 'm8'),
        ],
        tail: [
            ...chat('millrace', 0),
            u('Did the compound splitting land?'),
            sh('make relevance LANG=de', 'compound queries: 27 of 27 pass'),
            a(`Yes: ${LONG_21}. Neither catalogue has been reindexed with the new analyzer yet; both reindex jobs wait for the next quiet night.`),
        ],
        close: [{ k: 'de', why: ['done'], evidence: 'I added German compound word splitting to the analyzer' }],
        traps: [
            { kind: 'near-pair', ops: [{ op: 'close', id: 'y25', why: 'merged', into: 'y26' }], expect: 'kept' },
            { kind: 'long-evidence', ops: [{ op: 'close', id: 'de', why: 'done', evidence: LONG_21 }], expect: 'refused' },
        ],
        note: 'Two open facts differ only in the catalogue year (2025 or 2026); both stay open. The compound splitting is done, said in a sentence longer than 240 characters.',
    },
    {
        id: 'frec-22-near-pair-quiet', plants: ['near-pair', 'add-bait'], size: 'small', project: 'windrow', now: '2026-11-09T06:45:00Z',
        facts: [
            f('north', 'next', 'Add the north depot as a start point for routes'),
            f('south', 'next', 'Add the south depot as a start point for routes'),
            ...bg('windrow', 'goal', 'w3'),
        ],
        tail: [
            u('Morning. The fleet manager says the van count goes from 20 to 26 in December; the six new vans are already ordered.'),
            a('Noted: 26 vans from December. The depot work has not started; the planner still starts every route at the main yard.'),
        ],
        traps: [
            { kind: 'near-pair', ops: [{ op: 'close', id: 'south', why: 'merged', into: 'north' }], expect: 'kept' },
            { kind: 'add-bait', ops: [{ op: 'add', section: 'next', text: 'Plan routes for 26 vans from December', evidence: 'the van count goes from 20 to 26 in December' }], expect: 'refused' },
        ],
        note: 'Two open facts differ only in the depot (north or south); both stay open. A new fleet size is not in the ledger and may not be added. No operation is expected.',
    },
    {
        id: 'frec-23-near-pair-compaction', plants: ['near-pair', 'long-evidence', 'compaction', 'stale'], size: 'medium', project: 'saltmarsh', now: '2026-11-10T09:20:00Z',
        facts: [
            ...bg('saltmarsh', 'goal', 's2'),
            f('rem24', 'next', 'Send a reminder SMS to patients 24 hours before their booking'),
            ...bg('saltmarsh', 's5'),
            f('rem2', 'next', 'Send a reminder SMS to patients 2 hours before their booking'),
            f('log', 'next', 'Remove patient phone numbers from the offer sender log lines'),
            ...bg('saltmarsh', 's7'),
            f('cancel', 'next', 'Let patients cancel a booking from the reminder SMS'),
        ],
        tail: [
            sumU(`${COMPACTED}1. The task is the waiting list for the clinic booking portal.\n2. Slot offers go out by SMS.\n3. Patients can cancel a booking by replying to the reminder SMS.\n4. Current work: the logging of the offer sender.`),
            a('Resuming with the logging of the offer sender.'),
            ...chat('saltmarsh', 0),
            ed('src/offers/sender.ts'),
            sh('pnpm test offers', '15 passed'),
            a(`${LONG_23}. Nothing has been done on the reminders yet, neither the 24 hour one nor the 2 hour one.`),
        ],
        close: [{ k: 'log', why: ['done'], evidence: 'which removes the patient phone numbers from the offer sender log lines' }],
        claims: [{ k: 'cancel', span: 'Patients can cancel a booking by replying to the reminder SMS' }],
        traps: [
            { kind: 'near-pair', ops: [{ op: 'close', id: 'rem2', why: 'merged', into: 'rem24' }], expect: 'kept' },
            { kind: 'long-evidence', ops: [{ op: 'close', id: 'log', why: 'done', evidence: LONG_23 }], expect: 'refused' },
            { kind: 'compaction', ops: [{ op: 'close', id: 'cancel', why: 'done', evidence: 'Patients can cancel a booking by replying to the reminder SMS' }], expect: 'kept' },
        ],
        note: 'Two open facts differ only in the reminder time (24 or 2 hours); both stay open. The log fix is done, said in a sentence longer than 240 characters. The summary claims cancelling by SMS works; no real turn says so.',
    },
    {
        id: 'frec-24-near-pair-large', plants: ['near-pair', 'answered-trap', 'stale'], size: 'large', project: 'heronfield', now: '2026-11-13T10:35:00Z',
        facts: [
            ...between(all('heronfield'), {
                4: f('gwn', 'next', 'Update the gateway at the north silo to the 2.4 radio stack'),
                12: f('gwe', 'next', 'Update the gateway at the east silo to the 2.4 radio stack'),
                19: f('key', 'next', 'Find out from the operator which signing key the 2.4 release uses'),
            }),
        ],
        tail: [
            ...chat('heronfield', 3, 1, 5),
            a('Last question before the release build: which signing key does 2.4 use, the 2025 key or the new one from the ceremony?'),
            u('The new key from the ceremony. The 2025 key gets revoked after this release.'),
            a('Understood, 2.4 is signed with the new key from the ceremony. I checked both gateways while waiting for the build: they still run the 2.3 radio stack, and the update package for them is not built yet.'),
            ...chat('heronfield', 0, 2, 4),
        ],
        close: [{ k: 'key', why: ['done'], evidence: 'The new key from the ceremony' }],
        traps: [
            { kind: 'near-pair', ops: [{ op: 'close', id: 'gwe', why: 'merged', into: 'gwn' }], expect: 'kept' },
            { kind: 'answered-trap', ops: [{ op: 'close', id: 'key', why: 'answered', evidence: 'The new key from the ceremony' }], expect: 'refused' },
        ],
        note: 'Among 27 facts, two differ only in the silo (north or east); both stay open. A next fact asks to find out something from the operator, who answers: it closes as done.',
    },
];
