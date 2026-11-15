export type SectionName = 'goal' | 'now' | 'needs' | 'done' | 'decisions' | 'next' | 'links' | 'rules';
export type CloseWhy = 'done' | 'wrong' | 'superseded' | 'answered';

export interface Planted {
    readonly key: string;
    readonly section: SectionName;
    readonly text: string;
    readonly why?: string;
    readonly ref?: string;
    readonly closed?: CloseWhy;
    readonly age?: number;
}

export type Step =
    | { readonly u: string; readonly m: number }
    | { readonly a: string; readonly m: number }
    | { readonly t: readonly [kind: 'shell' | 'edit' | 'read' | 'web' | 'other', what: string, text?: string] };

export interface KeyFact {
    readonly section: SectionName;
    readonly accept?: readonly SectionName[];
    readonly text: string;
    readonly why?: string;
    readonly span: string;
    readonly whySpan?: string;
    readonly updates?: string;
}

export interface Scenario {
    readonly id: string;
    readonly project: string;
    readonly size: 'small' | 'medium' | 'large';
    readonly facts: number;
    readonly plants: readonly string[];
    readonly tags: readonly string[];
    readonly language?: string;
    readonly previousLanguage?: string;
    readonly zone?: string;
    readonly agent: { readonly kind: 'claude' | 'codex'; readonly label: string; readonly branch: string | null };
    readonly planted: readonly Planted[];
    readonly fillerFree?: boolean;
    readonly steps: readonly Step[];
    readonly key: readonly KeyFact[];
    readonly known?: readonly { readonly fact: string; readonly span: string; readonly naive: string }[];
    readonly close?: readonly { readonly fact: string; readonly why: readonly CloseWhy[]; readonly update: boolean; readonly span: string }[];
    readonly stay?: readonly string[];
    readonly rewriteTo?: string;
    readonly refuted?: readonly { readonly claim: string; readonly span: string; readonly by: string }[];
    readonly notEstablished?: readonly { readonly claim: string; readonly reason: string; readonly hidden?: string }[];
    readonly optional?: readonly { readonly text: string; readonly span: string; readonly sections: readonly SectionName[] }[];
    readonly goalBait?: string;
}

const SAL_HEAD = 'Root cause found on the bench: the nightly calibration flush at 03:00 sends a burst of zero readings, and `internal/sal/window.go` treats a zero as a real value, so the median drops below the page threshold and the pager fires.';

const SAL_MIDDLE = [
    'Details of the replay, for the record.',
    'I replayed the capture of station marsh-4.test from 02:50 to 03:10 three times and the result was the same each time.',
    'I also noticed that the battery gauge on marsh-4.test reports 11.2 V during the flush, which looks low, but I did not look into it.',
    'The flush lasts between 40 and 70 seconds depending on the station.',
    'During the flush the sensor reports 0.0 PSU on every tick, which is 12 to 20 ticks at the current rate.',
    'The window holds 30 ticks, so more than a third of it is zeros and the median falls from about 31 PSU to 0.',
    'The replay tool printed two warnings about clock skew in the capture; they do not change the outcome.',
    'The same pattern shows in the captures of reed-1.test and reed-2.test, with shorter flushes.',
].join(' ');

const SAL_TAIL = [
    'What I changed: `internal/sal/window.go` now drops readings flagged as calibration before it computes the median.',
    'The replay of 02:50 to 03:10 raises no page with the change, and `go test ./internal/sal/...` passes.',
    'The change is on branch fix/sal-calibration-window, commit 9d02c7e, not merged.',
    'What I did not change: the page threshold stays at 12 PSU.',
    'One thing needs your call: stations on firmware older than 3.1 do not set the calibration flag, so they will keep paging.',
    'Do you want a time-based mute from 03:00 to 03:02 for those, or a firmware update first?',
].join(' ');

export const SCENARIOS: readonly Scenario[] = [
    {
        id: 'writer-01-real-booking-tests', project: 'orchard-api', size: 'small', facts: 14, plants: ['real'], tags: ['easy', 'stale-next'],
        agent: { kind: 'claude', label: 'fix booking tests', branch: 'fix/overlap-null' },
        planted: [
            { key: 'goal', section: 'goal', text: 'Ship the overlap fix for double bookings to staging', age: 2900 },
            { key: 'run', section: 'next', text: 'Run the booking tests and fix what fails', age: 95 },
        ],
        steps: [
            { u: 'run the booking tests and fix what fails', m: 18 },
            { t: ['shell', 'bun test test/booking', '41 pass, 1 fail'] },
            { t: ['edit', 'src/booking/overlap.ts'] },
            { t: ['shell', 'bun test test/booking', '42 pass, 0 fail'] },
            { t: ['shell', "git commit -m 'fix: null slot in overlap check'"] },
            { a: 'One booking test failed: `test/booking/overlap.test.ts` expected a 409 and got a 500. The cause was a missing null check on the slot in `src/booking/overlap.ts`. I added the check and all 42 tests pass now. The fix is committed as 4be19a7 on fix/overlap-null. Nothing is pushed yet.', m: 11 },
        ],
        key: [
            { section: 'done', text: 'All 42 booking tests pass after a null check in `src/booking/overlap.ts`', span: 'I added the check and all 42 tests pass now' },
            { section: 'done', accept: ['links'], text: 'Overlap fix is committed as 4be19a7 on fix/overlap-null, not pushed yet', span: 'The fix is committed as 4be19a7 on fix/overlap-null' },
        ],
        close: [{ fact: 'run', why: ['done'], update: false, span: 'all 42 tests pass now' }],
        stay: ['goal'],
        notEstablished: [{ claim: 'The fix is pushed or merged', reason: 'the agent says nothing is pushed yet' }],
    },
    {
        id: 'writer-02-real-chartkit-upgrade', project: 'lantern-ui', size: 'small', facts: 22, plants: ['real'], tags: ['easy', 'stale-next', 'new-question'],
        agent: { kind: 'claude', label: 'bump chartkit', branch: 'chore/chartkit-4-3' },
        planted: [
            { key: 'goal', section: 'goal', text: 'Bring every dashboard dependency up to date before the pilot', age: 4100 },
            { key: 'bump', section: 'next', text: 'Bump `chartkit` to the latest minor', age: 130 },
        ],
        steps: [
            { u: 'bump chartkit to the latest minor and check the build', m: 25 },
            { t: ['shell', 'npm install chartkit@4.3.0'] },
            { t: ['shell', 'npm run build', 'built in 9.4s'] },
            { t: ['shell', 'glab mr create --fill'] },
            { a: '`chartkit` is upgraded from 4.2.1 to 4.3.0 in `package.json` and the build passes. I opened !57 with the change. One question: `SparkLegacy.svelte` has no users left after this upgrade. Should I delete it in the same merge request?', m: 14 },
        ],
        key: [
            { section: 'done', text: '`chartkit` is upgraded from 4.2.1 to 4.3.0 in `package.json`; the build passes', span: '`chartkit` is upgraded from 4.2.1 to 4.3.0 in `package.json` and the build passes' },
            { section: 'links', accept: ['done'], text: '!57 upgrades `chartkit` to 4.3.0', span: 'I opened !57 with the change' },
            { section: 'needs', text: 'Delete `SparkLegacy.svelte` in !57? Nothing uses the component after the upgrade.', span: 'Should I delete it in the same merge request?' },
        ],
        close: [{ fact: 'bump', why: ['done'], update: false, span: '`chartkit` is upgraded from 4.2.1 to 4.3.0' }],
        stay: ['goal'],
        notEstablished: [{ claim: '`SparkLegacy.svelte` was deleted', reason: 'the agent only asks whether to delete it' }, { claim: '!57 is merged', reason: 'the merge request was only opened' }],
    },
    {
        id: 'writer-03-real-orders-load', project: 'quarry-etl', size: 'medium', facts: 96, plants: ['real'], tags: ['stale-now', 'answered-question', 'look-alike'],
        agent: { kind: 'claude', label: 'nightly orders load', branch: 'fix/orders-window-utc' },
        planted: [
            { key: 'goal', section: 'goal', text: 'Get the nightly orders load reliable again', age: 1500 },
            { key: 'inv', section: 'now', text: 'Investigating the failing `stg_orders` nightly load', age: 70 },
            { key: 'q', section: 'needs', text: 'Confirm whether the 2026-11-01 partition of `stg_orders` may be reloaded?', age: 66 },
            { key: 'pay', section: 'decisions', text: 'Extract windows for `stg_payments` stay in local time', why: 'the finance reports are cut by local day', age: 3000 },
        ],
        steps: [
            { u: 'yes, reload the nov 1 partition. and tell me what broke the nightly', m: 41 },
            { t: ['shell', 'python -m jobs.extract_orders --date 2026-11-02 --dry-run'] },
            { t: ['edit', 'jobs/extract_orders.py'] },
            { t: ['shell', 'python -m jobs.load_stg_orders --date 2026-11-02', '18442 rows loaded'] },
            { t: ['shell', 'python -m dags.backfill_orders --date 2026-11-01'] },
            { a: 'The nightly broke on `stg_orders` with: duplicate key value violates unique constraint stg_orders_pkey. The extract window in `jobs/extract_orders.py` was built in local time, so after the clock change it overlapped the previous night by one hour. I changed the window to UTC. The rerun for 2026-11-02 loaded 18,442 rows with no duplicate. The reload of 2026-11-01 is running now and should take about 20 minutes.', m: 9 },
        ],
        key: [
            { section: 'done', text: '`stg_orders` failed on duplicate keys: the local-time extract window overlapped the previous night by one hour', span: 'after the clock change it overlapped the previous night by one hour' },
            { section: 'done', accept: ['decisions'], text: '`jobs/extract_orders.py` builds its extract window in UTC', span: 'I changed the window to UTC' },
            { section: 'done', text: 'Rerun for 2026-11-02 loaded 18,442 rows into `stg_orders` with no duplicate', span: 'The rerun for 2026-11-02 loaded 18,442 rows with no duplicate' },
            { section: 'now', text: 'Reload of the 2026-11-01 partition of `stg_orders` is running', span: 'The reload of 2026-11-01 is running now', updates: 'inv' },
        ],
        close: [
            { fact: 'inv', why: ['done', 'superseded'], update: true, span: 'The nightly broke on `stg_orders` with' },
            { fact: 'q', why: ['answered'], update: false, span: 'yes, reload the nov 1 partition' },
        ],
        stay: ['goal', 'pay'],
        notEstablished: [{ claim: 'The reload of 2026-11-01 finished', reason: 'it is still running at the end of the input' }, { claim: 'The `stg_payments` window moved to UTC', reason: 'only `jobs/extract_orders.py` changed' }],
    },
    {
        id: 'writer-04-real-salinity-pages', project: 'tidewatch', size: 'medium', facts: 104, plants: ['real'], tags: ['clipped-turn', 'stale-next', 'new-question'],
        agent: { kind: 'claude', label: 'salinity pages at 03:00', branch: 'fix/sal-calibration-window' },
        planted: [
            { key: 'goal', section: 'goal', text: 'Stop the false pages from the salinity probes', age: 2200 },
            { key: 'repro', section: 'next', text: 'Reproduce the 03:00 salinity pages on the test bench', age: 60 },
            { key: 'rule', section: 'rules', text: 'Never silence a probe for more than 24 hours', age: 5000 },
        ],
        steps: [
            { u: 'why do the salinity probes page every night around 03:00? reproduce it on the bench first', m: 52 },
            { t: ['shell', 'tidectl replay --from 02:50 --to 03:10 --probe salinity'] },
            { t: ['shell', 'go test ./internal/sal/...', 'FAIL tidewatch/internal/sal 1.6s'] },
            { t: ['edit', 'internal/sal/window.go'] },
            { t: ['shell', 'go test ./internal/sal/...', 'ok tidewatch/internal/sal 1.8s'] },
            { a: `${SAL_HEAD} ${SAL_MIDDLE} ${SAL_TAIL}`, m: 7 },
        ],
        key: [
            { section: 'done', text: 'Bench replay shows the 03:00 calibration flush sends zero readings that pull the salinity median down', span: 'the nightly calibration flush at 03:00 sends a burst of zero readings' },
            { section: 'done', text: '`internal/sal/window.go` drops calibration readings before computing the median', span: 'now drops readings flagged as calibration before it computes the median' },
            { section: 'done', text: 'Replay of 02:50 to 03:10 raises no page with the window fix', span: 'The replay of 02:50 to 03:10 raises no page with the change' },
            { section: 'links', accept: ['done'], text: 'fix/sal-calibration-window holds the window fix as 9d02c7e, not merged', span: 'The change is on branch fix/sal-calibration-window, commit 9d02c7e, not merged' },
            { section: 'needs', text: 'Stations on firmware older than 3.1 keep paging: mute 03:00 to 03:02, or update firmware first?', span: 'Do you want a time-based mute from 03:00 to 03:02 for those, or a firmware update first?' },
        ],
        close: [{ fact: 'repro', why: ['done'], update: false, span: 'Root cause found on the bench' }],
        stay: ['goal', 'rule'],
        notEstablished: [
            { claim: 'The battery gauge on marsh-4.test reads 11.2 V during the flush', reason: 'the sentence sits in the middle of the agent turn that the input builder clips: the writer never sees it', hidden: 'reports 11.2 V during the flush' },
            { claim: 'The window fix is merged', reason: 'the agent says the commit is not merged' },
            { claim: 'The page threshold changed', reason: 'the agent says the threshold stays at 12 PSU' },
        ],
    },
    {
        id: 'writer-05-real-line-rounding', project: 'mossbank', size: 'large', facts: 210, plants: ['real', 'reason'], tags: ['many-turns', 'stale-next', 'look-alike', 'rule'],
        agent: { kind: 'claude', label: 'invoice rounding', branch: 'fix/line-rounding' },
        planted: [
            { key: 'goal', section: 'goal', text: 'Make invoice totals match the finance sheet to the cent', age: 1800 },
            { key: 'find', section: 'next', text: 'Find why the March invoices are off by one cent', age: 80 },
            { key: 'credit', section: 'needs', text: 'Confirm whether credit notes follow the same rounding as invoices?', age: 2600 },
            { key: 'fx', section: 'decisions', text: 'Currency conversion rounds HALF_EVEN', why: 'the bank feed does the same', age: 6000 },
        ],
        steps: [
            { u: 'The March invoices are off by a cent on some lines. Find out why and fix it. Do not change stored amounts.', m: 34 },
            { t: ['shell', "./gradlew test --tests '*RoundTest'", 'RoundTest > 25 passed, 3 failed'] },
            { a: 'Found it. `app/money/Round.kt` rounds each line with HALF_EVEN, and the finance sheet rounds HALF_UP. 3 of 28 cases in `RoundTest` fail for that reason: amounts that end in exactly half a cent. I have not changed anything yet. Do you want HALF_UP per line, or rounding once on the invoice total?', m: 29 },
            { u: 'HALF_UP per line. The total must equal the sum of the printed lines, customers add them up.', m: 21 },
            { t: ['edit', 'app/money/Round.kt'] },
            { t: ['shell', "./gradlew test --tests '*RoundTest'", 'RoundTest > 28 passed'] },
            { t: ['shell', 'git push -u origin fix/line-rounding'] },
            { a: 'Done. `app/money/Round.kt` now rounds each line HALF_UP and `RoundTest` passes 28 of 28. I also re-ran the March sample: 1,204 invoices, 37 change by one cent, none by more. Stored amounts are untouched: the change only affects new invoices. Pushed as c41d9e2 to fix/line-rounding and opened !164.', m: 12 },
            { u: 'Good. Before merging I want the list of the 37 invoices as a CSV.', m: 6 },
            { t: ['shell', './gradlew run --args="diff-march --out out/march-diff.csv"'] },
            { a: 'Writing `out/march-diff.csv` now; the export is at about 400 of 1,204.', m: 4 },
        ],
        key: [
            { section: 'decisions', text: 'Invoice lines round HALF_UP, not HALF_EVEN', why: 'the total must equal the sum of the printed lines that customers add up', span: 'HALF_UP per line. The total must equal the sum of the printed lines', whySpan: 'The total must equal the sum of the printed lines' },
            { section: 'done', text: '`app/money/Round.kt` rounds each line HALF_UP; `RoundTest` passes 28 of 28', span: 'now rounds each line HALF_UP and `RoundTest` passes 28 of 28' },
            { section: 'done', text: 'March sample re-run: 37 of 1,204 invoices change by one cent, none by more', span: '1,204 invoices, 37 change by one cent, none by more' },
            { section: 'links', accept: ['done'], text: '!164 holds the line rounding fix, c41d9e2 on fix/line-rounding', span: 'Pushed as c41d9e2 to fix/line-rounding and opened !164' },
            { section: 'now', accept: ['needs', 'next'], text: 'Exporting the 37 changed March invoices to `out/march-diff.csv`', span: 'Writing `out/march-diff.csv` now' },
            { section: 'rules', text: 'Stored invoice amounts are never changed, as the operator requires', span: 'Do not change stored amounts' },
        ],
        close: [{ fact: 'find', why: ['done'], update: false, span: 'Found it. `app/money/Round.kt` rounds each line with HALF_EVEN' }],
        stay: ['goal', 'credit', 'fx'],
        notEstablished: [{ claim: '!164 is merged', reason: 'the operator wants the CSV before merging' }, { claim: 'The CSV export is finished', reason: 'the export is at about 400 of 1,204 at the end of the input' }, { claim: 'Credit notes use HALF_UP', reason: 'the turns only speak about invoice lines' }],
    },
    {
        id: 'writer-06-real-hotfix-goal-change', project: 'pelican-cli', size: 'large', facts: 540, plants: ['real', 'goal-change'], tags: ['many-turns', 'stale-now', 'one-goal'],
        agent: { kind: 'codex', label: 'release prep', branch: 'hotfix/2.3.2' },
        planted: [
            { key: 'goal', section: 'goal', text: 'Prepare the 2.4.0 release of pelican', age: 3300 },
            { key: 'bump', section: 'now', text: 'Bumping the crate versions to 2.4.0', age: 75 },
            { key: 'sign', section: 'rules', text: 'Every release artifact is signed with the release key', age: 7000 },
            { key: 'old', section: 'done', text: '2.3.1 is published to the registry', age: 6500 },
        ],
        steps: [
            { u: 'Change of plan. Stop the 2.4.0 prep. A user reported that `pelican verify` accepts a truncated archive in 2.3.1. The goal now is to ship a 2.3.2 hotfix for that today.', m: 33 },
            { t: ['shell', 'git switch -c hotfix/2.3.2 v2.3.1'] },
            { t: ['shell', 'cargo test verify::', 'test result: FAILED. 11 passed; 1 failed'] },
            { t: ['edit', 'src/verify/length.rs'] },
            { t: ['shell', 'cargo test verify::', 'test result: ok. 12 passed; 0 failed'] },
            { a: 'Understood: 2.4.0 is parked; its branch release/2.4.0 is left as it is. I created hotfix/2.3.2 from tag v2.3.1 and reproduced the bug with a new test, `verify::rejects_truncated_archive`: the length check in `src/verify/length.rs` compared against the header size, not the full archive size. It is fixed and the 12 verify tests pass. Still to do for 2.3.2: bump the version, sign the artifacts and publish.', m: 15 },
            { u: "ok. don't publish until I have looked at the diff.", m: 6 },
            { a: 'I will not publish. The diff is ready for you: `git diff v2.3.1..hotfix/2.3.2`, 2 files, 31 lines.', m: 5 },
        ],
        key: [
            { section: 'goal', text: 'Ship the 2.3.2 hotfix for `pelican verify` accepting a truncated archive', span: 'The goal now is to ship a 2.3.2 hotfix for that today', updates: 'goal' },
            { section: 'done', text: '`src/verify/length.rs` checks the full archive size; the 12 verify tests pass', span: 'It is fixed and the 12 verify tests pass' },
            { section: 'links', accept: ['done'], text: 'hotfix/2.3.2 is branched from tag v2.3.1', span: 'I created hotfix/2.3.2 from tag v2.3.1' },
            { section: 'needs', accept: ['rules'], text: 'Review `git diff v2.3.1..hotfix/2.3.2` before 2.3.2 is published', span: "don't publish until I have looked at the diff" },
            { section: 'next', text: 'Bump the version, sign the artifacts and publish 2.3.2', span: 'bump the version, sign the artifacts and publish' },
        ],
        close: [
            { fact: 'goal', why: ['superseded'], update: true, span: 'Stop the 2.4.0 prep' },
            { fact: 'bump', why: ['superseded', 'wrong'], update: false, span: '2.4.0 is parked' },
        ],
        stay: ['sign', 'old'],
        notEstablished: [{ claim: '2.3.2 is published', reason: 'the operator forbids publishing before the review' }, { claim: 'The branch release/2.4.0 was deleted', reason: 'the agent says it is left as it is' }],
    },
    {
        id: 'writer-07-quiet-thanks', project: 'orchard-api', size: 'small', facts: 18, plants: ['quiet'], tags: ['easy', 'chat-only'],
        agent: { kind: 'claude', label: 'csv export', branch: 'feat/schedule-csv' },
        planted: [
            { key: 'goal', section: 'goal', text: 'Add a CSV export of the harvest schedule', age: 2000 },
            { key: 'q', section: 'needs', text: 'Should the CSV export include cancelled harvests?', age: 240 },
        ],
        steps: [
            { u: "thanks, that's all for today", m: 5 },
            { a: "You're welcome. I have nothing else to report.", m: 4 },
        ],
        key: [],
        stay: ['goal', 'q'],
        notEstablished: [{ claim: 'The question about cancelled harvests was answered', reason: 'the operator only says thanks' }],
    },
    {
        id: 'writer-08-quiet-status-recap', project: 'lantern-ui', size: 'medium', facts: 88, plants: ['quiet', 'reworded'], tags: ['restated-ledger', 'reads-only'],
        agent: { kind: 'claude', label: 'devices and alerts pages', branch: 'feat/pilot-pages' },
        planted: [
            { key: 'goal', section: 'goal', text: 'Finish the devices and alerts pages for the pilot', age: 3100 },
            { key: 'd1', section: 'done', text: 'Device table sorts by last seen, newest first', age: 900 },
            { key: 'n1', section: 'next', text: 'Add the empty state to the alerts page', age: 700 },
            { key: 'q1', section: 'needs', text: 'Should the reports page default to 7 or 30 days?', age: 400 },
        ],
        steps: [
            { u: 'remind me where we are, short', m: 12 },
            { t: ['read', 'docs/pilot-checklist.md'] },
            { t: ['read', 'docs/pilot-notes.md'] },
            { a: 'Short version, nothing has changed since the last update. The device table sorts by last seen, newest first. The alerts page still needs its empty state. And I am still waiting for your answer on the default range of the reports page: 7 or 30 days.', m: 11 },
        ],
        key: [],
        known: [
            { fact: 'd1', span: 'The device table sorts by last seen, newest first', naive: 'The device table sorts by last seen, newest first' },
            { fact: 'n1', span: 'The alerts page still needs its empty state', naive: 'The alerts page still needs its empty state' },
            { fact: 'q1', span: 'still waiting for your answer on the default range of the reports page', naive: 'Waiting on the default range of the reports page: 7 or 30 days' },
        ],
        stay: ['goal', 'd1', 'n1', 'q1'],
    },
    {
        id: 'writer-09-quiet-pipeline-still-green', project: 'mossbank', size: 'medium', facts: 112, plants: ['quiet', 'reworded'], tags: ['restated-ledger'],
        agent: { kind: 'claude', label: 'dunning grace period', branch: 'feat/dunning-grace' },
        planted: [
            { key: 'goal', section: 'goal', text: 'Merge the dunning grace period change', age: 2500 },
            { key: 'ci', section: 'done', text: 'Pipeline for !88 is green', age: 200 },
            { key: 'mr', section: 'links', text: '!88', age: 600 },
            { key: 'ap', section: 'needs', text: 'Approve !88 so it can merge?', age: 190 },
        ],
        steps: [
            { u: 'is the pipeline for !88 still green?', m: 8 },
            { t: ['shell', 'glab ci status --branch feat/dunning-grace', 'passed'] },
            { a: 'Yes. The pipeline for !88 is still green, same as before. It is still waiting for your approval.', m: 7 },
        ],
        key: [],
        known: [
            { fact: 'ci', span: 'The pipeline for !88 is still green', naive: 'The pipeline for !88 is still green' },
            { fact: 'ap', span: 'It is still waiting for your approval', naive: '!88 is still waiting for approval' },
        ],
        stay: ['goal', 'ci', 'mr', 'ap'],
        notEstablished: [{ claim: '!88 is approved or merged', reason: 'it is still waiting for approval' }],
    },
    {
        id: 'writer-10-quiet-large-ledger', project: 'tidewatch', size: 'large', facts: 560, plants: ['quiet'], tags: ['chat-only', 'largest-ledger'],
        agent: { kind: 'claude', label: 'alert router rollout', branch: 'feat/router-rollout' },
        planted: [
            { key: 'goal', section: 'goal', text: 'Roll the new alert router out to all stations', age: 4000 },
        ],
        steps: [
            { u: 'ok', m: 3 },
            { a: 'Standing by.', m: 2 },
        ],
        key: [],
        stay: ['goal'],
    },
    {
        id: 'writer-11-reason-advisory-lock', project: 'orchard-api', size: 'small', facts: 20, plants: ['reason'], tags: ['easy', 'reason-in-earlier-turn'],
        agent: { kind: 'claude', label: 'slot hold', branch: 'feat/slot-hold' },
        planted: [
            { key: 'goal', section: 'goal', text: 'Prevent double bookings of a harvest slot', age: 2700 },
        ],
        steps: [
            { u: 'for holding a slot while the customer pays: Postgres advisory lock or a Redis lock?', m: 27 },
            { a: 'I recommend a Postgres advisory lock. The booking already runs inside one Postgres transaction, so the lock is released with it even if the process dies, and staging has no Redis at all. A Redis lock would add a service and a second failure mode.', m: 24 },
            { u: 'ok, advisory lock', m: 19 },
            { t: ['edit', 'src/booking/hold.ts'] },
            { t: ['shell', 'bun test test/booking/hold.test.ts', '6 pass, 0 fail'] },
            { a: 'Done: `src/booking/hold.ts` takes `pg_advisory_xact_lock` on the slot id before it inserts the hold. The 6 tests in `test/booking/hold.test.ts` pass.', m: 10 },
        ],
        key: [
            { section: 'decisions', text: 'Slot holds use a Postgres advisory lock, not a Redis lock', why: 'the booking already runs in one Postgres transaction and staging has no Redis', span: 'ok, advisory lock', whySpan: 'The booking already runs inside one Postgres transaction' },
            { section: 'done', text: '`src/booking/hold.ts` takes `pg_advisory_xact_lock` on the slot id before inserting the hold', span: 'takes `pg_advisory_xact_lock` on the slot id before it inserts the hold' },
        ],
        stay: ['goal'],
        optional: [{ text: 'The 6 tests in `test/booking/hold.test.ts` pass', span: 'The 6 tests in `test/booking/hold.test.ts` pass', sections: ['done'] }],
        notEstablished: [{ claim: 'A Redis lock was added', reason: 'Redis was the rejected option' }],
    },
    {
        id: 'writer-12-reason-plain-svg', project: 'lantern-ui', size: 'medium', facts: 92, plants: ['reason'], tags: ['reason-in-earlier-turn', 'rule', 'many-turns'],
        agent: { kind: 'claude', label: 'device sparkline', branch: 'feat/device-sparkline' },
        planted: [
            { key: 'goal', section: 'goal', text: 'Add a 24 hour sparkline to each device row', age: 1300 },
        ],
        steps: [
            { u: 'context before you start: the kiosk tablets are on 3G, so the bundle has to stay under 250 kB gzipped. that is a hard limit from now on.', m: 38 },
            { a: 'Noted. The bundle is at 231 kB gzipped today, so there are 19 kB of room.', m: 37 },
            { u: 'how would you draw the sparkline?', m: 30 },
            { a: 'Two options. A chart library such as `microplot` gives tooltips for free but adds about 34 kB gzipped. Plain SVG drawn by a small component adds under 2 kB and has no tooltip.', m: 28 },
            { u: 'plain svg then', m: 22 },
            { t: ['edit', 'src/lib/Sparkline.svelte'] },
            { t: ['shell', 'npm run build && npm run size', 'bundle: 232.4 kB gzipped'] },
            { a: '`src/lib/Sparkline.svelte` draws the last 24 hours as one SVG polyline, without a library. The bundle is now 232.4 kB gzipped.', m: 9 },
        ],
        key: [
            { section: 'rules', accept: ['decisions'], text: 'The bundle stays under 250 kB gzipped: the kiosk tablets are on 3G', span: 'the bundle has to stay under 250 kB gzipped' },
            { section: 'decisions', text: 'The device sparkline is plain SVG, without a chart library', why: '`microplot` adds about 34 kB and only 19 kB are free under the 250 kB limit', span: 'plain svg then', whySpan: 'adds about 34 kB gzipped' },
            { section: 'done', text: '`src/lib/Sparkline.svelte` draws the last 24 hours as one SVG polyline', span: 'draws the last 24 hours as one SVG polyline' },
            { section: 'done', text: 'Bundle is 232.4 kB gzipped with the sparkline', span: 'The bundle is now 232.4 kB gzipped' },
        ],
        stay: ['goal'],
        notEstablished: [{ claim: '`microplot` was installed', reason: 'the library was the rejected option' }, { claim: 'The sparkline has a tooltip', reason: 'the agent says plain SVG has no tooltip' }],
    },
    {
        id: 'writer-13-reason-integer-cents', project: 'mossbank', size: 'large', facts: 300, plants: ['reason'], tags: ['answered-question', 'look-alike'],
        agent: { kind: 'claude', label: 'fenwick export', branch: 'feat/fenwick-export' },
        planted: [
            { key: 'goal', section: 'goal', text: 'Export invoices to the fenwick-books ledger', age: 2100 },
            { key: 'q', section: 'needs', text: 'Which number format does the ledger import expect: decimals or whole cents?', age: 300 },
            { key: 'pdf', section: 'decisions', text: 'The invoice PDF shows amounts with two decimals', why: 'customers read the PDF, not the export', age: 5200 },
        ],
        steps: [
            { u: 'on your question: integer cents. the fenwick-books import rejects anything with a decimal point, I checked their spec this morning. decimals stay only in the PDF.', m: 44 },
            { t: ['edit', 'app/export/FenwickRow.kt'] },
            { t: ['shell', "./gradlew test --tests '*FenwickRowTest'", 'FenwickRowTest > 14 passed'] },
            { t: ['shell', './gradlew run --args="fenwick-export --month 2026-03"'] },
            { a: 'Changed: `app/export/FenwickRow.kt` writes every amount as integer cents, for example 1999 for 19.99. `FenwickRowTest` passes with 14 cases, including a negative credit note. The sample file for March is at `out/fenwick-2026-03.csv`, 1,204 rows.', m: 20 },
        ],
        key: [
            { section: 'decisions', text: 'The fenwick-books export writes amounts as integer cents', why: 'the fenwick-books import rejects any amount with a decimal point', span: 'the fenwick-books import rejects anything with a decimal point', whySpan: 'the fenwick-books import rejects anything with a decimal point' },
            { section: 'done', text: '`app/export/FenwickRow.kt` writes every amount as integer cents; `FenwickRowTest` passes 14 cases', span: 'writes every amount as integer cents' },
            { section: 'links', accept: ['done'], text: '`out/fenwick-2026-03.csv` is the March sample export, 1,204 rows', span: 'The sample file for March is at `out/fenwick-2026-03.csv`' },
        ],
        close: [{ fact: 'q', why: ['answered'], update: false, span: 'on your question: integer cents' }],
        stay: ['goal', 'pdf'],
        notEstablished: [{ claim: 'The PDF now shows integer cents', reason: 'the operator says decimals stay in the PDF' }, { claim: 'The export was sent to fenwick-books', reason: 'only a sample file was written' }],
    },
    {
        id: 'writer-14-reworded-probe-timeout', project: 'tidewatch', size: 'small', facts: 26, plants: ['reworded'], tags: ['easy', 'one-new-fact'],
        agent: { kind: 'claude', label: 'gauge-3 restart', branch: 'fix/probe-timeout' },
        planted: [
            { key: 'goal', section: 'goal', text: 'Cut the probe false alarms on the coastal gauges', age: 2400 },
            { key: 'dup', section: 'done', text: 'Probe timeout raised from 5 s to 15 s in `config/probes.toml`', age: 150 },
        ],
        steps: [
            { u: 'restart the daemon on gauge-3 so it picks up the config', m: 16 },
            { t: ['shell', 'ssh gauge-3.test sudo systemctl restart tidewatchd'] },
            { t: ['shell', 'ssh gauge-3.test systemctl is-active tidewatchd', 'active'] },
            { a: '`tidewatchd` is restarted on gauge-3.test and reports active. It now runs with the setting from earlier: probes wait 15 seconds instead of 5 before they give up, as set in config/probes.toml.', m: 13 },
        ],
        key: [
            { section: 'done', text: '`tidewatchd` is restarted on gauge-3.test and reports active', span: '`tidewatchd` is restarted on gauge-3.test and reports active' },
        ],
        known: [{ fact: 'dup', span: 'probes wait 15 seconds instead of 5 before they give up', naive: 'Probes wait 15 seconds instead of 5 before they give up, as set in config/probes.toml' }],
        stay: ['goal', 'dup'],
    },
    {
        id: 'writer-15-reworded-migration-status', project: 'quarry-etl', size: 'medium', facts: 100, plants: ['reworded'], tags: ['one-new-fact', 'restated-ledger'],
        agent: { kind: 'claude', label: 'basalt-2 migration', branch: 'feat/basalt-2-loads' },
        planted: [
            { key: 'goal', section: 'goal', text: 'Move the warehouse loads from slate-1 to basalt-2', age: 5600 },
            { key: 'd1', section: 'done', text: '`dim_customer` load moved to basalt-2 and matches the old row count', age: 1500 },
            { key: 'd2', section: 'decisions', text: 'The old cluster slate-1 stays read-only until 2026-11-20', why: 'finance needs it for the month-end close', age: 2900 },
        ],
        steps: [
            { u: 'status of the migration?', m: 30 },
            { t: ['shell', 'python -m checks.compare --table fact_orders --old slate-1 --new basalt-2', 'rows old=2210418 new=2210418 diff=0'] },
            { a: 'Since the last update one thing is new: `fact_orders` is now loaded on basalt-2 and the row counts match, 2,210,418 on both sides. For the rest, as before: the customer dimension already runs on basalt-2 with the same number of rows as on the old cluster, and slate-1 will not accept writes until 20 November because finance still needs it to close the month.', m: 26 },
        ],
        key: [
            { section: 'done', text: '`fact_orders` loads on basalt-2; row counts match at 2,210,418 on both sides', span: '`fact_orders` is now loaded on basalt-2 and the row counts match' },
        ],
        known: [
            { fact: 'd1', span: 'the customer dimension already runs on basalt-2 with the same number of rows as on the old cluster', naive: 'The customer dimension runs on basalt-2 with the same number of rows as on the old cluster' },
            { fact: 'd2', span: 'slate-1 will not accept writes until 20 November', naive: 'slate-1 accepts no writes until 20 November because finance needs it to close the month' },
        ],
        stay: ['goal', 'd1', 'd2'],
    },
    {
        id: 'writer-16-reworded-proxy-needle', project: 'pelican-cli', size: 'large', facts: 420, plants: ['reworded', 'quiet'], tags: ['needle-in-ledger', 'restated-ledger'],
        agent: { kind: 'codex', label: 'publish behind proxy', branch: 'fix/proxy-publish' },
        planted: [
            { key: 'goal', section: 'goal', text: 'Make `pelican publish` work behind a corporate proxy', age: 4300 },
            { key: 'dup', section: 'done', text: '`pelican publish` honours HTTPS_PROXY and NO_PROXY from the environment', age: 3900 },
        ],
        steps: [
            { u: 'does publish respect the proxy env vars or not? I forgot', m: 10 },
            { a: 'Yes, already. `pelican publish` reads the proxy address and the exclusion list from the usual environment variables, HTTPS_PROXY and NO_PROXY. Nothing changed today.', m: 9 },
        ],
        key: [],
        known: [{ fact: 'dup', span: 'reads the proxy address and the exclusion list from the usual environment variables', naive: '`pelican publish` reads the proxy address and the exclusion list from HTTPS_PROXY and NO_PROXY' }],
        stay: ['goal', 'dup'],
    },
    {
        id: 'writer-17-second-goal-onboarding-aside', project: 'lantern-ui', size: 'small', facts: 24, plants: ['second-goal'], tags: ['one-goal', 'operator-aside'],
        agent: { kind: 'claude', label: 'dark theme settings', branch: 'feat/settings-dark' },
        planted: [
            { key: 'goal', section: 'goal', text: 'Ship the dark theme for the settings page', age: 1900 },
        ],
        steps: [
            { u: 'the toggle is hard to see in dark mode, fix the contrast. (at some point we should also redo the whole onboarding flow, but not now)', m: 21 },
            { t: ['edit', 'src/lib/Toggle.svelte'] },
            { t: ['shell', 'npm run test:a11y -- Toggle', 'contrast 4.8:1 pass'] },
            { a: '`src/lib/Toggle.svelte` now uses `--ink-2` for the track in dark mode. The contrast ratio went from 2.1:1 to 4.8:1 and the a11y check passes.', m: 12 },
        ],
        key: [
            { section: 'done', text: '`src/lib/Toggle.svelte` uses `--ink-2` in dark mode; contrast went from 2.1:1 to 4.8:1', span: 'The contrast ratio went from 2.1:1 to 4.8:1' },
        ],
        stay: ['goal'],
        goalBait: 'at some point we should also redo the whole onboarding flow',
        optional: [{ text: 'Redo the onboarding flow later, not now', span: 'at some point we should also redo the whole onboarding flow', sections: ['next'] }],
        notEstablished: [{ claim: 'The onboarding flow is the goal or is being redone', reason: 'the operator says "but not now"' }],
    },
    {
        id: 'writer-18-second-goal-openapi-coverage', project: 'orchard-api', size: 'medium', facts: 84, plants: ['second-goal'], tags: ['one-goal', 'agent-aside'],
        agent: { kind: 'claude', label: 'crew endpoints docs', branch: 'docs/openapi-crews' },
        planted: [
            { key: 'goal', section: 'goal', text: 'Document the crew and harvest endpoints in `docs/openapi.yaml`', age: 1700 },
        ],
        steps: [
            { u: 'add the three crew endpoints to openapi.yaml', m: 35 },
            { t: ['edit', 'docs/openapi.yaml'] },
            { t: ['shell', 'npx redocly lint docs/openapi.yaml', 'Woohoo! Your API description is valid.'] },
            { a: '`docs/openapi.yaml` now describes GET /crews, POST /crews and GET /crews/{id}, and `redocly lint` reports it valid. While I was there I noticed the plots endpoints are missing too. The real aim should probably be full OpenAPI coverage of the whole API, and after that generating the client from it. I did not touch any of that.', m: 18 },
        ],
        key: [
            { section: 'done', text: '`docs/openapi.yaml` describes GET /crews, POST /crews and GET /crews/{id}; `redocly lint` passes', span: 'now describes GET /crews, POST /crews and GET /crews/{id}' },
        ],
        stay: ['goal'],
        goalBait: 'The real aim should probably be full OpenAPI coverage of the whole API',
        optional: [{ text: 'The plots endpoints are missing from `docs/openapi.yaml`', span: 'I noticed the plots endpoints are missing too', sections: ['next', 'needs', 'done'] }],
        notEstablished: [{ claim: 'The goal is full OpenAPI coverage or a generated client', reason: 'it is the agent\'s own aside, the operator asked for the crew endpoints' }, { claim: 'The plots endpoints were documented', reason: 'the agent says it did not touch them' }],
    },
    {
        id: 'writer-19-contradicted-disk-alert', project: 'tidewatch', size: 'small', facts: 16, plants: ['contradicted'], tags: ['retracted-in-turns', 'new-question'],
        agent: { kind: 'claude', label: 'gauge-7 disk alert', branch: null },
        planted: [
            { key: 'goal', section: 'goal', text: 'Clear the open alerts on the gauge fleet', age: 1100 },
        ],
        steps: [
            { u: 'there is a disk alert on gauge-7, look at it', m: 40 },
            { a: 'I looked at the alert history. The disk alert on gauge-7.test is a false alarm: the same alert fired and cleared four times last week without any action, so the sensor is miscalibrated.', m: 38 },
            { u: 'check the actual disk before you say that', m: 33 },
            { t: ['shell', 'ssh gauge-7.test df -h /var', '/dev/sda2 50G 48G 1.4G 97% /var'] },
            { t: ['shell', 'ssh gauge-7.test du -sh /var/log/tidewatch', '41G'] },
            { a: 'I was wrong. The disk on gauge-7.test is really full: /var is at 97 % with 1.4 GB free. `/var/log/tidewatch` alone holds 41 GB of logs, because log rotation is not installed on that host. I have not deleted anything. Do you want me to remove logs older than 14 days?', m: 29 },
        ],
        key: [
            { section: 'done', accept: ['now'], text: '/var on gauge-7.test is at 97 % with 1.4 GB free', span: '/var is at 97 % with 1.4 GB free' },
            { section: 'done', text: '`/var/log/tidewatch` on gauge-7.test holds 41 GB: log rotation is not installed', span: '`/var/log/tidewatch` alone holds 41 GB of logs' },
            { section: 'needs', text: 'Remove logs older than 14 days from gauge-7.test?', span: 'Do you want me to remove logs older than 14 days?' },
        ],
        stay: ['goal'],
        refuted: [{ claim: 'The disk alert on gauge-7.test is a false alarm from a miscalibrated sensor', span: 'The disk alert on gauge-7.test is a false alarm', by: 'I was wrong. The disk on gauge-7.test is really full' }],
        notEstablished: [{ claim: 'Logs were deleted on gauge-7.test', reason: 'the agent says it has not deleted anything' }],
    },
    {
        id: 'writer-20-contradicted-release-build', project: 'pelican-cli', size: 'small', facts: 28, plants: ['contradicted'], tags: ['retracted-in-turns'],
        agent: { kind: 'codex', label: 'hotfix 2.3.2', branch: 'hotfix/2.3.2' },
        planted: [
            { key: 'goal', section: 'goal', text: 'Ship pelican 2.3.2', age: 800 },
            { key: 'pub', section: 'next', text: 'Publish 2.3.2 once the release build is green', age: 300 },
        ],
        steps: [
            { u: 'is the release build for 2.3.2 green?', m: 30 },
            { t: ['shell', 'glab ci status --branch hotfix/2.3.2', 'running'] },
            { a: 'The release build for 2.3.2 is green on all three platforms, so it can be published.', m: 28 },
            { t: ['shell', 'glab ci view hotfix/2.3.2', 'build-macos failed'] },
            { a: "Correction to my last message: I read the status too early. The macOS job failed afterwards at the signing step: `codesign` exited with code 1, 'no identity found'. Linux and Windows are green. 2.3.2 cannot be published yet.", m: 17 },
        ],
        key: [
            { section: 'done', accept: ['now', 'needs'], text: "macOS release job for 2.3.2 failed at signing: `codesign` exited with code 1, 'no identity found'", span: '`codesign` exited with code 1' },
            { section: 'done', text: 'Linux and Windows release builds for 2.3.2 are green', span: 'Linux and Windows are green' },
        ],
        stay: ['goal', 'pub'],
        refuted: [{ claim: 'The release build for 2.3.2 is green on all three platforms and can be published', span: 'The release build for 2.3.2 is green on all three platforms', by: 'The macOS job failed afterwards at the signing step' }],
        notEstablished: [{ claim: '2.3.2 is published', reason: 'the agent says it cannot be published yet' }],
    },
    {
        id: 'writer-21-contradicted-tax-rate', project: 'mossbank', size: 'medium', facts: 90, plants: ['contradicted'], tags: ['stale-ledger-fact', 'look-alike'],
        agent: { kind: 'claude', label: 'regional tax tables', branch: 'fix/nv2-rate' },
        planted: [
            { key: 'goal', section: 'goal', text: 'Keep the regional tax tables current', age: 9000 },
            { key: 'nv2', section: 'done', text: 'Tax rate for region NV-2 is 8.5 % in `rates/nv2.yaml`', age: 4000 },
            { key: 'nv3', section: 'done', text: 'Tax rate for region NV-3 is 8.5 % in `rates/nv3.yaml`', age: 3990 },
        ],
        steps: [
            { u: 'NV-2 went up to 9 % on November 1. fix the table. NV-3 is unchanged.', m: 26 },
            { t: ['edit', 'rates/nv2.yaml'] },
            { t: ['shell', "./gradlew test --tests '*RateTableTest'", 'RateTableTest > 22 passed'] },
            { a: '`rates/nv2.yaml` now has 9.0 % for NV-2, valid from 2026-11-01; the 8.5 % row is kept with an end date of 2026-10-31 so that older invoices still compute. `RateTableTest` passes, 22 cases. I did not touch `rates/nv3.yaml`.', m: 15 },
        ],
        key: [
            { section: 'done', text: '`rates/nv2.yaml` has 9.0 % for NV-2 from 2026-11-01; the 8.5 % row ends 2026-10-31', span: '`rates/nv2.yaml` now has 9.0 % for NV-2, valid from 2026-11-01', updates: 'nv2' },
        ],
        close: [{ fact: 'nv2', why: ['superseded', 'wrong'], update: true, span: 'NV-2 went up to 9 % on November 1' }],
        stay: ['goal', 'nv3'],
        notEstablished: [{ claim: 'The NV-3 rate changed', reason: 'the operator says NV-3 is unchanged and the agent did not touch its file' }],
    },
    {
        id: 'writer-22-language-en-to-es-small', project: 'orchard-api', size: 'small', facts: 12, plants: ['language', 'quiet'], tags: ['easy', 'chat-only', 'en-to-es'],
        language: 'es', previousLanguage: 'en', rewriteTo: 'es',
        agent: { kind: 'claude', label: 'harvest reminders', branch: 'feat/reminder-mail' },
        planted: [
            { key: 'goal', section: 'goal', text: 'Send harvest reminders by mail the day before', age: 2300 },
        ],
        steps: [
            { u: 'ok, gracias', m: 6 },
            { a: 'De nada. No tengo nada nuevo que reportar.', m: 5 },
        ],
        key: [],
        stay: ['goal'],
    },
    {
        id: 'writer-23-language-es-to-en-small', project: 'lantern-ui', size: 'small', facts: 10, plants: ['language', 'quiet'], tags: ['chat-only', 'es-to-en', 'hand-written-ledger'],
        language: 'en', previousLanguage: 'es', rewriteTo: 'en', fillerFree: true,
        agent: { kind: 'claude', label: 'página de alertas', branch: 'feat/pilot-pages' },
        planted: [
            { key: 'goal', section: 'goal', text: 'Terminar la página de alertas para el piloto', age: 3000 },
            { key: 's1', section: 'done', text: 'La tabla de dispositivos ordena por la última conexión', age: 2000 },
            { key: 's2', section: 'done', text: '`src/lib/Toggle.svelte` pasa la revisión de contraste con 4.8:1', age: 1700 },
            { key: 's3', section: 'done', text: 'El filtro de fechas guarda su valor en la URL', age: 1300 },
            { key: 's4', section: 'needs', text: '¿La página de reportes abre con 7 o con 30 días?', age: 900 },
            { key: 's5', section: 'next', text: 'Agregar el estado vacío a la página de alertas', age: 700 },
            { key: 's6', section: 'next', text: 'Traducir los mensajes de error de `src/api/client.ts`', age: 650 },
            { key: 's7', section: 'decisions', text: 'El sparkline se dibuja con SVG simple', why: 'una librería de gráficos pasa el límite de 250 kB', age: 600 },
            { key: 's8', section: 'rules', text: 'El bundle se queda por debajo de 250 kB comprimido', age: 590 },
            { key: 's9', section: 'links', text: '!57', age: 500 },
        ],
        steps: [
            { u: 'ok thanks', m: 9 },
            { a: "You're welcome. Nothing new on my side.", m: 8 },
        ],
        key: [],
        stay: ['goal', 's4', 's5', 's9'],
    },
    {
        id: 'writer-24-language-en-to-es-medium', project: 'mossbank', size: 'medium', facts: 90, plants: ['language', 'quiet', 'reworded'], tags: ['en-to-es', 'restated-ledger'],
        language: 'es', previousLanguage: 'en', rewriteTo: 'es',
        agent: { kind: 'claude', label: 'dunning grace period', branch: 'feat/dunning-grace' },
        planted: [
            { key: 'goal', section: 'goal', text: 'Merge the dunning grace period change', age: 2500 },
            { key: 'wait', section: 'now', text: 'Waiting for the pipeline of !131', age: 20 },
        ],
        steps: [
            { u: 'sigue', m: 7 },
            { t: ['shell', 'glab ci status --branch feat/dunning-grace', 'running'] },
            { a: 'Sigo esperando el pipeline de !131; todavía está corriendo, sin resultado.', m: 6 },
        ],
        key: [],
        known: [{ fact: 'wait', span: 'Sigo esperando el pipeline de !131', naive: 'Esperando el pipeline de !131, que todavía está corriendo' }],
        stay: ['goal'],
        notEstablished: [{ claim: 'The pipeline of !131 finished', reason: 'the agent says it is still running' }],
    },
];
