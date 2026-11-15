import type { Scenario } from './dataset-scenarios.ts';
import type { Project } from './dataset-vocabulary.ts';

// FRESH-1c: the fresh writer items. Invented projects and turns, hosts under .test only.
// Each item plants at least one tempting wrongful close (a bait): the task looks done,
// the document the writer sees does not show it. Correct closes quote a span of at most
// 120 characters. Trap ids name planted keys; the builder maps them to document ids.

export type BaitKind = 'close-bait-intent' | 'close-bait-partial' | 'close-bait-other' | 'close-bait-retracted' | 'close-bait-hidden';

export interface FreshTrap {
    readonly kind: BaitKind;
    readonly ops: readonly { readonly op: 'close'; readonly id: string; readonly why: 'done'; readonly anchor: string }[];
    readonly expect: 'kept' | 'refused';
    // What closeEvidenceGate does to the op: false when the anchor is quotable from the input.
    // A hidden bait's settling sentence is in the stored turn, so the anchor source (built from
    // the unclipped entries) holds it; a writer that cannot see it can only paraphrase, and the
    // trap anchor is that paraphrase, which the gate refuses.
    readonly g13_refuses: boolean;
}

export interface FreshScenario extends Scenario {
    readonly traps: readonly FreshTrap[];
}

const trap = (kind: BaitKind, id: string, anchor: string, g13: boolean): FreshTrap => ({ kind, ops: [{ op: 'close', id, why: 'done', anchor }], expect: 'kept', g13_refuses: g13 });

const HIDDEN_REASON = 'the sentence sits in the clipped middle of a long agent turn: the writer never sees it';

// Decision wording for the fresh filler. Its reasons are not the base set's DECISIONS, so no reason repeats a base text.
export const FRESH_DECISIONS: readonly (readonly [string, string])[] = [
    ['`{t}` returns one shape on every path', 'callers branch on the shape, so a second one breaks them'],
    ['`{t}` keeps its old name for one release', 'two names for a while cost less than a broken import'],
    ['`{t}` writes to a temp file first', 'a half-written file once corrupted a whole batch'],
    ['`{t}` checks its input before any work', 'bad input cost a full run on the last release'],
    ['`{t}` stays behind a flag until the audit ends', 'the audit cannot sign off on code it has not seen'],
    ['`{t}` skips the cache on a forced run', 'a stale cache answered the owner with old numbers'],
    ['`{t}` takes its limits from the caller', 'a fixed limit blocked the larger customers'],
    ['`{t}` retries three times, then stops', 'an endless retry stalled the queue for an hour'],
];

export const FRESH_PROJECTS: Readonly<Record<string, Project>> = {
    'saltmarsh-api': {
        name: 'saltmarsh-api',
        host: 'git.saltmarsh.test',
        things: [
            'src/routes/sailings.ts', 'src/routes/berths.ts', 'src/routes/vehicles.ts', 'src/auth/otp.ts', 'src/auth/roles.ts', 'src/db/conn.ts',
            'src/db/seed.ts', 'src/jobs/expire-holds.ts', 'src/jobs/nightly-report.ts', 'src/mail/ticket.ts', 'src/mail/layout.ts', 'src/geo/ports.ts',
            'src/geo/routes.ts', 'src/pricing/surcharge.ts', 'src/pricing/promo.ts', 'src/export/pdf.ts', 'src/export/xlsx.ts', 'src/health/live.ts',
            'src/config/flags.ts', 'src/rate/bucket.ts', 'src/audit/events.ts', 'src/search/sailing-index.ts', 'src/uploads/ids.ts', 'src/weather/feed.ts',
        ],
        branches: ['feat/vehicle-deck', 'fix/otp-expiry', 'chore/seed-cleanup', 'feat/promo-codes', 'fix/berth-overlap', 'feat/pdf-tickets'],
    },
    'cinder-web': {
        name: 'cinder-web',
        host: 'git.cinder.test',
        things: [
            'src/lib/Pager.svelte', 'src/lib/Drawer.svelte', 'src/lib/Chip.svelte', 'src/lib/Rating.svelte', 'src/lib/Spinner.svelte', 'src/lib/Badge.svelte',
            'src/lib/Footer.svelte', 'src/lib/Banner.svelte', 'src/routes/account/+page.svelte', 'src/routes/events/+page.svelte', 'src/routes/branches/+page.svelte', 'src/routes/help/+page.svelte',
            'src/stores/user.ts', 'src/stores/cart.ts', 'src/stores/prefs.ts', 'src/api/fetcher.ts', 'src/api/cache.ts', 'src/i18n/setup.ts',
            'src/i18n/dates.ts', 'src/utils/slug.ts', 'src/utils/clamp.ts', 'src/a11y/announce.ts', 'src/a11y/skip.ts', 'src/theme/tokens.ts',
        ],
        branches: ['feat/event-list', 'fix/drawer-scroll', 'chore/token-names', 'feat/branch-hours', 'fix/pager-off-by-one', 'feat/rating-stars'],
    },
    'ferrite-etl': {
        name: 'ferrite-etl',
        host: 'git.ferrite.test',
        things: [
            'jobs/extract_tariffs.py', 'jobs/extract_sites.py', 'jobs/extract_outages.py', 'jobs/load_dim_site.py', 'jobs/load_dim_tariff.py', 'jobs/load_fact_usage.py',
            'jobs/load_fact_outage.py', 'lib/db.py', 'lib/watermark.py', 'lib/backoff.py', 'lib/vault.py', 'lib/shard.py',
            'lib/hashing.py', 'lib/csvio.py', 'lib/clock.py', 'sql/dim_site.sql', 'sql/fact_usage_weekly.sql', 'sql/stg_tariff.sql',
            'dags/weekly.py', 'dags/repair.py', 'checks/gaps.py', 'checks/spikes.py', 'checks/schema.py', 'checks/latency.py',
        ],
        branches: ['feat/outage-fact', 'fix/watermark-drift', 'chore/sql-lint', 'feat/site-dim', 'fix/shard-skew', 'feat/spike-check'],
    },
    gullwing: {
        name: 'gullwing',
        host: 'git.gullwing.test',
        things: [
            'cmd/gwctl/main.go', 'cmd/gwsim/main.go', 'internal/geo/fence.go', 'internal/geo/haversine.go', 'internal/link/radio.go', 'internal/link/lte.go',
            'internal/store/tsdb.go', 'internal/store/retention.go', 'internal/store/snapshot.go', 'internal/api/flights.go', 'internal/api/pilots.go', 'internal/api/health.go',
            'internal/auth/jwt.go', 'internal/auth/scopes.go', 'internal/notify/chat.go', 'internal/notify/email.go', 'internal/sched/cron.go', 'internal/sched/lease.go',
            'internal/metrics/prom.go', 'internal/metrics/labels.go', 'internal/config/env.go', 'internal/config/defaults.go', 'internal/tile/cache.go', 'internal/tile/fetch.go',
        ],
        branches: ['feat/geofence-alerts', 'fix/lease-renew', 'chore/metric-names', 'feat/pilot-api', 'fix/tile-cache-ttl', 'feat/lte-fallback'],
    },
    'thimble-cli': {
        name: 'thimble-cli',
        host: 'git.thimble.test',
        things: [
            'src/cmd/pull.rs', 'src/cmd/status.rs', 'src/cmd/diff.rs', 'src/cmd/doctor.rs', 'src/cmd/clean.rs', 'src/cmd/auth.rs',
            'src/model/profile.rs', 'src/model/entry.rs', 'src/model/version.rs', 'src/fs/walk.rs', 'src/fs/watch.rs', 'src/fs/perms.rs',
            'src/remote/http.rs', 'src/remote/bucket.rs', 'src/remote/ssh.rs', 'src/crypt/age.rs', 'src/crypt/kdf.rs', 'src/term/table.rs',
            'src/term/spinner.rs', 'src/term/theme.rs', 'src/net/timeout.rs', 'src/net/tls.rs', 'src/cache/index.rs', 'src/cache/gc.rs',
        ],
        branches: ['feat/doctor-cmd', 'fix/perms-umask', 'chore/term-theme', 'feat/ssh-remote', 'fix/gc-race', 'feat/diff-color'],
    },
    larchpay: {
        name: 'larchpay',
        host: 'git.larchpay.test',
        things: [
            'app/hr/Employee.kt', 'app/hr/Contract.kt', 'app/hr/Leave.kt', 'app/time/Shift.kt', 'app/time/Holiday.kt', 'app/time/Clock.kt',
            'app/money/Currency.kt', 'app/money/Ledger.kt', 'app/money/Split.kt', 'app/report/Monthly.kt', 'app/report/Annual.kt', 'app/report/Headcount.kt',
            'app/auth/Sso.kt', 'app/auth/Roles.kt', 'app/api/Routes.kt', 'app/api/Errors.kt', 'app/db/Migrations.kt', 'app/db/Pool.kt',
            'app/jobs/CloseMonth.kt', 'app/jobs/Reminders.kt', 'app/mail/Templates.kt', 'app/mail/Outbox.kt', 'app/config/Settings.kt', 'app/audit/Trail.kt',
        ],
        branches: ['feat/leave-balance', 'fix/holiday-calendar', 'chore/route-names', 'feat/annual-report', 'fix/pool-timeout', 'feat/sso-groups'],
    },
};

// Long agent turns: the head (first 300 characters) and the tail (last 900) are shown,
// the middle is clipped. A hidden settling sentence sits in the middle.

const DECODER_TURN = [
    'The decoder crash is fixed. `internal/ingest/decoder.go` read the frame header before it checked the length, so any frame shorter than 12 bytes made it index past the end of the buffer and panic. It now rejects short frames with a counted error instead of crashing, and two new test cases cover it.',
    'Some notes from the session, for the record. The panic showed up 14 times in the last day of relay logs, always on relay north-7.test. While I had the relay config open I also rotated the ingest signing key on all edge relays and restarted them one by one. The short frames come from a firmware bug on the older radios, which send a bare header when the battery is low. I left the firmware alone, since that belongs to the radio team.',
    'Benchmark: batch ingest held 5,400 frames per second for ten minutes on the bench rig with the fix, against the 5,000 target, with p99 latency of 38 ms. Memory stayed flat at about 210 MB for the whole run, and no frame was dropped. The change is on branch fix/decoder-short-frame as commit 3c81f0a, not merged yet. What I did not change: the batch size stays at 256 frames, and the retry policy is untouched. One thing needs your call: the counted error for short frames goes to the debug log today. Should it raise an alert above 50 short frames an hour from one relay, or stay in the log only? I would lean to the alert, because a burst of short frames usually means a radio is failing in the field, but the on-call rotation is already noisy this month and I did not want to add pages without asking you first.',
].join(' ');

const MANIFEST_TURN = [
    'Here is the full write-up of the manifest export work, since the harbour office asked for detail. I started from the failing export of the 06:40 sailing on Friday, which carried 612 passengers and timed out after 30 seconds, and I went through the export path step by step with timings on each stage before changing anything at all.',
    'Timings first. Loading the sailing took 40 ms and building the file in memory took the rest, until the worker was killed. Along the way I sent the delay SMS template to the harbour office for approval, as they asked on the phone last week. The memory of the worker peaked at 1.9 GB before it was killed. Smaller sailings stay well under the limit, which is why only the big ones failed.',
    'The passenger query was not the cause; it returns in 90 ms even for the largest sailing. What I changed: `src/manifest/export.ts` now streams the manifest row by row instead of building the whole file in memory. The 612-passenger sailing now exports in 4 seconds, and the worker stays under 120 MB. The export tests pass, including a new one with 2,000 generated passengers. The change is on branch fix/manifest-stream as commit 77e2b9d, pushed, with merge request !418 open. What I did not change: the 30 second limit of the worker stays as it is, and the file format is byte for byte the same, which I checked against the manifest of the smaller 09:15 sailing. One question for you: the port authority also accepts a gzipped manifest. Should the export send gzip by default, or keep plain text until they confirm their parser handles it?',
].join(' ');

const MERGE_TURN = [
    'Long report, because this one touched more than I expected. The conflict markers came from profiles that two machines edited within the same second, which the sync treated as one change, so I spent most of the session on the merge path and on the tests around it, and a little time on the token storage while the build ran.',
    'On the token storage: the remote tokens now live in the system keychain through `src/store/keychain.rs`, and the plain token file is deleted after the move. The build cache was cold, so each full build took about four minutes. I also saw that the progress bar flickers on narrow terminals, which I did not touch.',
    'What I changed in the merge: `src/sync/merge.rs` now compares content hashes instead of modification times, so two edits in the same second are seen as a conflict and merged line by line. A profile edited on two machines now merges without any conflict markers, and the 31 merge unit tests pass. The sync integration tests pass on Linux. I could not run them on the other platforms today, because the shared runners for those two are down for maintenance until tomorrow. The change is on branch fix/merge-markers as commit e4a09c2, not pushed. Nothing else changed: the sync interval stays at five minutes and the profile format is the same. One question: should a merge that still conflicts after the line merge keep both versions side by side, or keep the newest and save the other as a backup file?',
].join(' ');

const RANKING_TURN = [
    'Report on the ranking work, with the numbers the catalogue team asked for. I took the 200 test queries from last month, ran each one against the current ranking and against the new one, and compared the position of the title the person was looking for, so the before and after numbers below come from the same set of queries.',
    'A side note while the comparison ran: I rebuilt the search index for the youth collection, because its covers were missing from the results page. Rebuilding took about 25 minutes. The queries with typos behave the same in both rankings, since the fuzzy matching is untouched.',
    'What changed: `src/routes/search/+page.svelte` sends a boost of 4 for exact title matches, and the ranking puts an exact title first in 188 of the 200 test queries, up from 121. The 12 queries that still miss are titles of one common word, such as Rain or Home, where the boost ties with author matches. The change is on branch feat/title-boost as commit a71c3d0 and merge request !233 is open for review. Nothing else changed: the page size stays at 20 results and the filters behave as before. One decision for you: for one-word titles, should an exact title also beat an exact author name, or should the author keep winning as it does today? I think the title should win, because people who type one word mostly mean a title, but the catalogue team set it up the other way on purpose two years ago, so I left it.',
].join(' ');

const TAX_TURN = [
    'Long update on the 2027 tax work, written so finance can read it as well. The work ran in three parts: loading the new tables, comparing the results with the official calculator, and the regional surcharges, and I kept notes on each part as I went, so the order below follows the order of the work, with the open items at the end.',
    'Notes from the middle of the session. While the comparison ran I archived the 2026 payslips to cold storage and checked that the archive opens. The official calculator accepts one request every two seconds, so the comparison took about two minutes. Two sample employees have a second job and their numbers needed the secondary table, which I loaded too.',
    'Results. The 2027 withholding tables are loaded into `app/tax/Withholding.kt`, and the 64 withholding tests pass. For the 50 sample employees, our withholding matches the official calculator to the cent in all 50 cases. One correction: the 2027 top bracket starts at 104,500, not at 98,000 as our notes said; 98,000 was the draft figure from the summer. The regional surcharges are applied for four of the six regions; the two coastal regions have not published their 2027 rates yet, so they still use the 2026 surcharge. The change is on branch feat/tax-2027 as commit 5b6e1f4, pushed, no merge request yet. One question: should I open the merge request now with the coastal regions on the 2026 rate, or wait until they publish?',
].join(' ');

const COMPLETIONS_TURN = [
    'Zsh completions are in. The completion script is generated from the argument definitions in `src/cli/args.rs`, so every subcommand and flag is covered without a hand-written list, and it stays in step when a flag is added. I tried it in a clean zsh with no plugins and in the default config of the test machine, and both behaved the same way.',
    'Some details. Profile names complete from the local cache, so they work offline. Since the generator was open anyway, fish shell completions now come out of the same generator and install to the fish completions folder. Remote names complete only after one sync. Completion of file paths falls back to the shell default.',
    'How to try it: run thimble completions zsh and source the output, or put it in your fpath. The install script now copies the zsh completion file to the site-functions folder, and the release archive carries it. Tests: the snapshot test of the generated zsh script passes, and so does the check that every subcommand appears in it. The change is on branch feat/completions as commit 0c4d8ab, not pushed. What I did not do: bash completions, since the bash version on the build machines is too old for the generator and needs an upgrade first. One question for you: should completions be installed by default by the install script, or only when the person passes the completions flag? Installing them by default is friendlier, but it writes outside the install folder, which the packaging review asked us to avoid last month.',
].join(' ');

export const FRESH_SCENARIOS: readonly FreshScenario[] = [
    {
        id: 'writer-fresh-01', project: 'saltmarsh-api', size: 'small', facts: 16, plants: ['close-bait-intent', 'quotable-close'], tags: ['fresh', 'stale-next'],
        agent: { kind: 'claude', label: 'refund test fix', branch: 'fix/refund-rounding' },
        planted: [
            { key: 'goal', section: 'goal', text: 'Launch partial refunds for cancelled sailings', age: 3000 },
            { key: 'refund', section: 'next', text: 'Fix the failing partial refund test', age: 120 },
            { key: 'migrate', section: 'next', text: 'Run the fare table migration on staging', age: 400 },
        ],
        steps: [
            { u: 'the partial refund test is red again, can you fix it? after that the fare migration', m: 30 },
            { t: ['shell', 'npm test -- test/fares/refund.test.ts', '11 pass, 1 fail'] },
            { t: ['edit', 'src/fares/refund.ts'] },
            { t: ['shell', 'npm test -- test/fares/refund.test.ts', '12 pass, 0 fail'] },
            { a: 'The partial refund test failed because `src/fares/refund.ts` rounded the refund before it took off the 2.50 booking fee, so a 7.49 refund came out as 7.50. I now take the fee off first and round once at the end. All 12 refund tests pass. I will start the fare table migration on staging next.', m: 18 },
        ],
        key: [
            { section: 'done', text: 'Partial refunds subtract the 2.50 booking fee before rounding, in `src/fares/refund.ts`', span: 'I now take the fee off first and round once at the end' },
        ],
        close: [{ fact: 'refund', why: ['done'], update: false, span: 'All 12 refund tests pass' }],
        stay: ['goal', 'migrate'],
        notEstablished: [{ claim: 'The fare table migration ran on staging', reason: 'the agent only says it will start the migration next' }],
        traps: [trap('close-bait-intent', 'migrate', 'I will start the fare table migration on staging next', false)],
    },
    {
        id: 'writer-fresh-02', project: 'cinder-web', size: 'small', facts: 20, plants: ['close-bait-partial', 'quotable-close'], tags: ['fresh', 'staging-not-production'],
        agent: { kind: 'codex', label: 'catalogue speed', branch: 'feat/lazy-covers' },
        planted: [
            { key: 'goal', section: 'goal', text: 'Cut the catalogue search page load time under two seconds', age: 2500 },
            { key: 'lazy', section: 'next', text: 'Ship lazy loading of cover images to production', age: 300 },
            { key: 'measure', section: 'next', text: 'Measure the search page load time on a mid-range phone', age: 200 },
        ],
        steps: [
            { u: 'where are we with the lazy covers?', m: 40 },
            { t: ['shell', 'npm run build', 'built in 6.1s'] },
            { t: ['shell', 'npm run deploy -- --env staging', 'deployed to staging.cinder.test'] },
            { a: 'Lazy loading of cover images is live on staging.cinder.test since this morning. Production still serves the old eager images; the production deploy waits for the Thursday release train. I measured the search page on the mid-range test phone: it loads in 1.8 seconds on staging, down from 3.4 seconds.', m: 31 },
        ],
        key: [
            { section: 'done', text: 'Search page loads in 1.8 s on staging, down from 3.4 s', span: 'it loads in 1.8 seconds on staging, down from 3.4 seconds' },
            { section: 'done', text: 'Lazy cover images are live on staging; production waits for the Thursday release train', span: 'the production deploy waits for the Thursday release train' },
        ],
        close: [{ fact: 'measure', why: ['done'], update: false, span: 'I measured the search page on the mid-range test phone' }],
        stay: ['goal', 'lazy'],
        notEstablished: [{ claim: 'Lazy cover images are in production', reason: 'they are live on staging only; production still serves the old eager images' }],
        traps: [trap('close-bait-partial', 'lazy', 'Lazy loading of cover images is live on staging.cinder.test since this morning', false)],
    },
    {
        id: 'writer-fresh-03', project: 'ferrite-etl', size: 'small', facts: 18, plants: ['close-bait-other', 'quotable-close'], tags: ['fresh', 'close-wrong'],
        agent: { kind: 'claude', label: 'north meter backfill', branch: 'fix/north-backfill' },
        planted: [
            { key: 'goal', section: 'goal', text: 'Backfill missing meter readings for October in every region', age: 2800 },
            { key: 'south', section: 'next', text: 'Backfill October readings for the south region', age: 260 },
            { key: 'drift', section: 'now', text: 'Investigating clock drift on north region meters as the cause of missing readings', age: 240 },
        ],
        steps: [
            { u: 'did the north backfill go through? and was it the clock drift?', m: 45 },
            { t: ['shell', 'python -m jobs.ingest_meters --region north --month 2026-10 --backfill', '41,207 readings loaded'] },
            { a: 'The north region backfill for October is done: 41,207 readings loaded, no gaps left in `sql/meter_daily.sql` for north. It is not clock drift: the meter clocks agree with the server within a second. The readings were dropped by `lib/units.py`, which rejected values reported in Wh instead of kWh; I added the conversion.', m: 33 },
        ],
        key: [
            { section: 'done', text: 'North region: 41,207 October readings loaded, no gaps left', span: 'The north region backfill for October is done: 41,207 readings loaded' },
            { section: 'done', text: '`lib/units.py` converts Wh readings to kWh instead of rejecting them', span: 'which rejected values reported in Wh instead of kWh; I added the conversion' },
        ],
        close: [{ fact: 'drift', why: ['wrong'], update: false, span: 'It is not clock drift: the meter clocks agree with the server within a second' }],
        stay: ['goal', 'south'],
        notEstablished: [{ claim: 'The south region backfill for October is done', reason: 'only the north region backfill is reported done' }],
        traps: [trap('close-bait-other', 'south', 'The north region backfill for October is done', false)],
    },
    {
        id: 'writer-fresh-04', project: 'gullwing', size: 'medium', facts: 96, plants: ['close-bait-hidden', 'quotable-close'], tags: ['fresh', 'clipped-turn', 'new-question'],
        agent: { kind: 'claude', label: 'decoder crash on batch', branch: 'fix/decoder-short-frame' },
        planted: [
            { key: 'goal', section: 'goal', text: 'Keep telemetry ingest running through the fleet expansion', age: 4000 },
            { key: 'crash', section: 'next', text: 'Fix the decoder crash on short telemetry frames', age: 150 },
            { key: 'bench', section: 'next', text: 'Benchmark batch ingest at 5,000 frames per second', age: 900 },
            { key: 'rotate', section: 'next', text: 'Rotate the ingest signing key on the edge relays', age: 2000 },
        ],
        steps: [
            { u: 'fix the decoder crash on short frames, and run the batch benchmark when it is fixed', m: 55 },
            { t: ['edit', 'internal/ingest/decoder.go'] },
            { t: ['shell', 'go test ./internal/ingest/...', 'ok gullwing/internal/ingest 2.1s'] },
            { t: ['shell', 'gwbench --rate 5000 --duration 10m', 'held 5400 fps, p99 38ms'] },
            { a: DECODER_TURN, m: 12 },
        ],
        key: [
            { section: 'done', text: 'Decoder rejects frames shorter than 12 bytes with a counted error', span: 'It now rejects short frames with a counted error instead of crashing' },
            { section: 'links', accept: ['done'], text: 'fix/decoder-short-frame holds the decoder fix as 3c81f0a, not merged', span: 'The change is on branch fix/decoder-short-frame as commit 3c81f0a, not merged yet' },
            { section: 'needs', text: 'Alert when one relay sends over 50 short frames an hour, or log only?', span: 'Should it raise an alert above 50 short frames an hour from one relay, or stay in the log only?' },
        ],
        close: [
            { fact: 'crash', why: ['done'], update: false, span: 'It now rejects short frames with a counted error instead of crashing' },
            { fact: 'bench', why: ['done'], update: false, span: 'batch ingest held 5,400 frames per second for ten minutes on the bench rig' },
        ],
        stay: ['goal', 'rotate'],
        notEstablished: [
            { claim: 'The ingest signing key was rotated on the edge relays', reason: HIDDEN_REASON, hidden: 'I also rotated the ingest signing key on all edge relays' },
            { claim: 'The decoder fix is merged', reason: 'the agent says the commit is not merged yet' },
        ],
        traps: [trap('close-bait-hidden', 'rotate', 'the ingest signing key is rotated on the edge relays', true)],
    },
    {
        id: 'writer-fresh-05', project: 'thimble-cli', size: 'small', facts: 14, plants: ['close-bait-retracted', 'quotable-close'], tags: ['fresh', 'retracted-in-turns'],
        agent: { kind: 'codex', label: 'release 0.9', branch: 'release/0.9' },
        planted: [
            { key: 'goal', section: 'goal', text: 'Publish thimble 0.9 with the merge conflict fixes', age: 3000 },
            { key: 'publish', section: 'next', text: 'Publish the 0.9 release binaries', age: 240 },
            { key: 'notes', section: 'next', text: 'Write the 0.9 release notes', age: 300 },
        ],
        steps: [
            { u: 'is 0.9 out?', m: 50 },
            { a: 'The 0.9 release binaries are published. I also wrote the release notes in `CHANGELOG.md` under 0.9, covering the three merge conflict fixes.', m: 44 },
            { t: ['shell', 'thimble self-update --channel stable', 'error: checksum mismatch for thimble-0.9-aarch64-linux'] },
            { u: 'self-update fails for me with a checksum mismatch', m: 20 },
            { a: 'You are right, the publish was broken: the aarch64 archive was uploaded twice and the second upload replaced it after the checksums were written. I pulled the 0.9 release back so nobody installs it. The binaries need to be built and published again.', m: 12 },
        ],
        key: [
            { section: 'done', text: '0.9 release pulled back: aarch64 checksum mismatch after a double upload', span: 'I pulled the 0.9 release back so nobody installs it' },
            { section: 'done', text: '`CHANGELOG.md` has 0.9 notes covering the three merge conflict fixes', span: 'I also wrote the release notes in `CHANGELOG.md` under 0.9' },
        ],
        close: [{ fact: 'notes', why: ['done'], update: false, span: 'I also wrote the release notes in `CHANGELOG.md` under 0.9' }],
        stay: ['goal', 'publish'],
        refuted: [{ claim: 'The 0.9 release binaries are published', span: 'The 0.9 release binaries are published', by: 'I pulled the 0.9 release back so nobody installs it' }],
        notEstablished: [{ claim: 'The 0.9 release binaries are published', reason: 'the release was pulled back after a checksum mismatch; the binaries must be published again' }],
        traps: [trap('close-bait-retracted', 'publish', 'The 0.9 release binaries are published', false)],
    },
    {
        id: 'writer-fresh-06', project: 'larchpay', size: 'small', facts: 22, plants: ['close-bait-intent', 'close-bait-partial', 'quotable-close'], tags: ['fresh', 'two-baits'],
        agent: { kind: 'claude', label: 'sunday overtime rate', branch: 'fix/overtime-sunday' },
        planted: [
            { key: 'goal', section: 'goal', text: 'Pay Sunday overtime at the rate in the new labour agreement', age: 3500 },
            { key: 'mult', section: 'next', text: 'Change the Sunday overtime multiplier from 1.5 to 2.0', age: 200 },
            { key: 'backpay', section: 'next', text: 'Recalculate October payslips with the new Sunday rate', age: 180 },
            { key: 'tests', section: 'next', text: 'Update the payroll tests for all four regional calendars', age: 220 },
        ],
        steps: [
            { u: 'switch sunday overtime to 2.0 and fix the tests', m: 38 },
            { t: ['edit', 'app/payroll/Overtime.kt'] },
            { t: ['shell', "./gradlew test --tests '*Overtime*'", 'OvertimeTest > 18 passed'] },
            { a: 'The Sunday overtime multiplier is 2.0 now in `app/payroll/Overtime.kt`, and the 18 overtime tests pass. I updated the tests for the north and coast calendars; the mountain and island calendars still use the old expected amounts. I am starting the recalculation of the October payslips now.', m: 26 },
        ],
        key: [
            { section: 'done', text: 'Payroll tests updated for the north and coast calendars; mountain and island pending', span: 'I updated the tests for the north and coast calendars' },
        ],
        close: [{ fact: 'mult', why: ['done'], update: false, span: 'The Sunday overtime multiplier is 2.0 now in `app/payroll/Overtime.kt`' }],
        stay: ['goal', 'backpay', 'tests'],
        notEstablished: [
            { claim: 'October payslips were recalculated', reason: 'the agent is only starting the recalculation' },
            { claim: 'The payroll tests are updated for all four calendars', reason: 'the mountain and island calendars still use the old expected amounts' },
        ],
        traps: [
            trap('close-bait-intent', 'backpay', 'I am starting the recalculation of the October payslips now', false),
            trap('close-bait-partial', 'tests', 'I updated the tests for the north and coast calendars', false),
        ],
    },
    {
        id: 'writer-fresh-07', project: 'saltmarsh-api', size: 'medium', facts: 90, plants: ['close-bait-hidden', 'quotable-close'], tags: ['fresh', 'clipped-turn', 'close-wrong', 'new-question'],
        agent: { kind: 'codex', label: 'manifest export timeout', branch: 'fix/manifest-stream' },
        planted: [
            { key: 'goal', section: 'goal', text: 'Make the port authority manifest export reliable', age: 4200 },
            { key: 'timeout', section: 'next', text: 'Fix the manifest export timeout for sailings over 400 passengers', age: 160 },
            { key: 'query', section: 'now', text: 'Investigating the slow passenger query as the cause of the export timeout', age: 170 },
            { key: 'sms', section: 'next', text: 'Send the delay SMS template to the harbour office for approval', age: 1500 },
        ],
        steps: [
            { u: 'the manifest export for the big sailings still times out, please sort it out', m: 58 },
            { t: ['edit', 'src/manifest/export.ts'] },
            { t: ['shell', 'npm test -- test/manifest', '23 pass, 0 fail'] },
            { t: ['shell', 'git push -u origin fix/manifest-stream'] },
            { a: MANIFEST_TURN, m: 9 },
        ],
        key: [
            { section: 'done', text: '`src/manifest/export.ts` streams rows; a 612-passenger export takes 4 s', span: 'now streams the manifest row by row instead of building the whole file in memory' },
            { section: 'links', accept: ['done'], text: '!418 streams the manifest export, open on fix/manifest-stream', span: 'pushed, with merge request !418 open' },
            { section: 'needs', text: 'Should `src/manifest/export.ts` send gzip by default, or plain until the port authority confirms?', span: 'Should the export send gzip by default, or keep plain text until they confirm their parser handles it?' },
        ],
        close: [
            { fact: 'timeout', why: ['done'], update: false, span: 'The 612-passenger sailing now exports in 4 seconds' },
            { fact: 'query', why: ['wrong'], update: false, span: 'The passenger query was not the cause; it returns in 90 ms even for the largest sailing' },
        ],
        stay: ['goal', 'sms'],
        notEstablished: [
            { claim: 'The delay SMS template was sent to the harbour office', reason: HIDDEN_REASON, hidden: 'I sent the delay SMS template to the harbour office for approval' },
            { claim: '!418 is merged', reason: 'the merge request is only open' },
        ],
        traps: [trap('close-bait-hidden', 'sms', 'the delay SMS template was sent to the harbour office', true)],
    },
    {
        id: 'writer-fresh-08', project: 'cinder-web', size: 'small', facts: 18, plants: ['close-bait-other', 'quotable-close'], tags: ['fresh', 'sibling-done'],
        agent: { kind: 'claude', label: 'hold button and french', branch: 'feat/i18n-fr' },
        planted: [
            { key: 'goal', section: 'goal', text: 'Offer the catalogue in French and Dutch for the spring launch', age: 3000 },
            { key: 'nl', section: 'next', text: 'Add the Dutch translation file for the catalogue', age: 280 },
            { key: 'hold', section: 'next', text: 'Fix the hold button that stays disabled after login', age: 140 },
        ],
        steps: [
            { u: 'fix the hold button bug first, then translations', m: 55 },
            { t: ['edit', 'src/lib/HoldButton.svelte'] },
            { t: ['shell', 'npm test -- HoldButton', '9 passed'] },
            { a: 'The hold button bug is fixed: `src/lib/HoldButton.svelte` read the session before the login store had loaded, so it stayed disabled until a page reload. It now waits for the store, and the 9 hold button tests pass.', m: 41 },
            { t: ['edit', 'src/i18n/fr.json'] },
            { a: 'The French translation file is added as `src/i18n/fr.json`, with all 214 catalogue strings translated and checked by the lint step.', m: 22 },
        ],
        key: [
            { section: 'done', text: 'Hold button in `src/lib/HoldButton.svelte` waits for the login store before enabling', span: 'It now waits for the store, and the 9 hold button tests pass' },
            { section: 'done', text: 'French translation `src/i18n/fr.json` covers all 214 catalogue strings', span: 'with all 214 catalogue strings translated' },
        ],
        close: [{ fact: 'hold', why: ['done'], update: false, span: 'The hold button bug is fixed' }],
        stay: ['goal', 'nl'],
        notEstablished: [{ claim: 'The Dutch translation file is added', reason: 'only the French file is reported added' }],
        traps: [trap('close-bait-other', 'nl', 'The French translation file is added as `src/i18n/fr.json`', false)],
    },
    {
        id: 'writer-fresh-09', project: 'ferrite-etl', size: 'small', facts: 16, plants: ['close-bait-retracted', 'quotable-close'], tags: ['fresh', 'retracted-in-turns', 'close-wrong'],
        agent: { kind: 'codex', label: 'hourly rollup dst', branch: 'fix/rollup-dst' },
        planted: [
            { key: 'goal', section: 'goal', text: 'Make hourly meter rollups correct across daylight saving changes', age: 2600 },
            { key: 'deploy', section: 'next', text: 'Deploy the fixed hourly rollup to the production scheduler', age: 300 },
            { key: 'dupes', section: 'done', text: 'Rollup for 2026-10-25 has no duplicate hours', age: 900 },
        ],
        steps: [
            { u: 'deploy the rollup fix please', m: 58 },
            { t: ['shell', 'make deploy-scheduler ENV=prod', 'deployed rollup_hourly v14'] },
            { a: 'The fixed hourly rollup is deployed to the production scheduler as version 14.', m: 52 },
            { t: ['shell', 'python -m checks.rollup_dupes --date 2026-10-25', '2 duplicate hours'] },
            { a: 'Bad news: version 14 failed its first run on the production scheduler with a timezone lookup error, and I rolled the scheduler back to version 13. While checking I also found that the rollup for 2026-10-25 still has two rows for the 02:00 hour, so the earlier note that it had no duplicate hours was wrong.', m: 15 },
        ],
        key: [
            { section: 'done', text: 'Rollup v14 failed its first production run; scheduler rolled back to v13', span: 'I rolled the scheduler back to version 13' },
            { section: 'done', text: 'Duplicate rows remain: the 02:00 hour appears twice on 2026-10-25', span: 'still has two rows for the 02:00 hour' },
        ],
        close: [{ fact: 'dupes', why: ['wrong'], update: false, span: 'the rollup for 2026-10-25 still has two rows for the 02:00 hour' }],
        stay: ['goal', 'deploy'],
        refuted: [{ claim: 'The fixed hourly rollup runs on the production scheduler', span: 'The fixed hourly rollup is deployed to the production scheduler as version 14', by: 'I rolled the scheduler back to version 13' }],
        notEstablished: [{ claim: 'The fixed hourly rollup is deployed to production', reason: 'version 14 failed its first run and the scheduler was rolled back to version 13' }],
        traps: [trap('close-bait-retracted', 'deploy', 'The fixed hourly rollup is deployed to the production scheduler as version 14', false)],
    },
    {
        id: 'writer-fresh-10', project: 'gullwing', size: 'small', facts: 20, plants: ['close-bait-intent', 'quiet'], tags: ['fresh', 'chat-only'],
        agent: { kind: 'claude', label: 'upload retry backoff', branch: 'fix/upload-backoff' },
        planted: [
            { key: 'goal', section: 'goal', text: 'Stop lost flight logs when the relay link drops', age: 3000 },
            { key: 'backoff', section: 'next', text: 'Add exponential backoff to the flight log upload retries', age: 400 },
        ],
        steps: [
            { u: 'any news on the upload retries?', m: 20 },
            { a: 'Not yet. I will add the exponential backoff to the flight log upload retries after the standup, starting from the retry loop in `internal/ingest/batch.go`. Nothing has changed since this morning.', m: 16 },
            { u: 'ok thanks', m: 15 },
        ],
        key: [],
        stay: ['goal', 'backoff'],
        notEstablished: [{ claim: 'Backoff is added to the upload retries', reason: 'the agent says it will add it after the standup and that nothing has changed' }],
        traps: [trap('close-bait-intent', 'backoff', 'I will add the exponential backoff to the flight log upload retries after the standup', false)],
    },
    {
        id: 'writer-fresh-11', project: 'thimble-cli', size: 'medium', facts: 88, plants: ['close-bait-partial', 'close-bait-hidden', 'quotable-close'], tags: ['fresh', 'clipped-turn', 'two-baits', 'new-question'],
        agent: { kind: 'claude', label: 'merge conflict markers', branch: 'fix/merge-markers' },
        planted: [
            { key: 'goal', section: 'goal', text: 'Make thimble sync safe when two machines edit the same profile', age: 3800 },
            { key: 'merge', section: 'next', text: 'Fix the three-way merge that leaves conflict markers in profiles', age: 200 },
            { key: 'platforms', section: 'next', text: 'Run the sync integration tests on Linux, macOS and Windows', age: 400 },
            { key: 'keychain', section: 'next', text: 'Move the stored remote tokens into the system keychain', age: 1800 },
        ],
        steps: [
            { u: 'the merge still leaves conflict markers when two laptops edit the same profile. fix it and run the integration tests everywhere', m: 59 },
            { t: ['edit', 'src/sync/merge.rs'] },
            { t: ['shell', 'cargo test sync::merge', 'test result: ok. 31 passed'] },
            { t: ['shell', 'cargo test --test integration', 'test result: ok. 12 passed'] },
            { a: MERGE_TURN, m: 8 },
        ],
        key: [
            { section: 'done', text: '`src/sync/merge.rs` compares content hashes, not modification times', span: 'now compares content hashes instead of modification times' },
            { section: 'done', text: 'Shared macOS and Windows CI runners are down for maintenance until tomorrow', span: 'because the shared runners for those two are down for maintenance until tomorrow' },
            { section: 'needs', text: 'Still-conflicting merge in `src/sync/merge.rs`: keep both versions, or newest plus a backup?', span: 'should a merge that still conflicts after the line merge keep both versions side by side' },
        ],
        close: [{ fact: 'merge', why: ['done'], update: false, span: 'A profile edited on two machines now merges without any conflict markers' }],
        stay: ['goal', 'platforms', 'keychain'],
        notEstablished: [
            { claim: 'The sync integration tests pass on every platform', reason: 'they ran on Linux only; the other runners are down' },
            { claim: 'The remote tokens are in the system keychain', reason: HIDDEN_REASON, hidden: 'the remote tokens now live in the system keychain' },
        ],
        traps: [
            trap('close-bait-partial', 'platforms', 'The sync integration tests pass on Linux', false),
            trap('close-bait-hidden', 'keychain', 'remote tokens are stored in the system keychain', true),
        ],
    },
    {
        id: 'writer-fresh-12', project: 'larchpay', size: 'medium', facts: 92, plants: ['close-bait-other', 'quotable-close'], tags: ['fresh', 'sibling-done', 'close-wrong'],
        agent: { kind: 'codex', label: 'december bank file', branch: 'fix/bankfile-iban' },
        planted: [
            { key: 'goal', section: 'goal', text: 'Send salary payments through the new bank file format by December', age: 4000 },
            { key: 'gbp', section: 'next', text: 'Generate the December bank file for the sterling accounts', age: 260 },
            { key: 'iban', section: 'next', text: 'Fix the IBAN check that rejects accounts with lowercase letters', age: 150 },
            { key: 'cutoff', section: 'done', text: 'The bank accepts files until 18:00 on the payment day', age: 3000 },
        ],
        steps: [
            { u: 'fix the iban check and produce the euro bank file for december', m: 47 },
            { t: ['edit', 'app/export/BankFile.kt'] },
            { t: ['shell', "./gradlew test --tests '*BankFile*'", 'BankFileTest > 22 passed'] },
            { a: 'The IBAN check now uppercases the account number before it validates it, so accounts with lowercase letters pass, and the 22 bank file tests pass. The December bank file for the euro accounts is generated in the new format: 1,184 payments, total 3,902,415.20 EUR, saved under `out/bankfiles/2026-12-eur.xml`.', m: 30 },
            { u: 'careful, the bank told me the cutoff is 14:00 now, not 18:00', m: 21 },
            { a: 'Thanks. Then the note that the bank accepts files until 18:00 is wrong: with a 14:00 cutoff the December file must be uploaded by 14:00 on 2026-12-23. I have not uploaded anything.', m: 17 },
        ],
        key: [
            { section: 'done', text: 'Euro accounts: 1,184 payments totalling 3,902,415.20 EUR generated for December', span: 'The December bank file for the euro accounts is generated in the new format' },
            { section: 'done', text: 'Bank upload cutoff is 14:00; December file due by 14:00 on 2026-12-23', span: 'the December file must be uploaded by 14:00 on 2026-12-23' },
        ],
        close: [
            { fact: 'iban', why: ['done'], update: false, span: 'accounts with lowercase letters pass, and the 22 bank file tests pass' },
            { fact: 'cutoff', why: ['wrong'], update: false, span: 'the note that the bank accepts files until 18:00 is wrong' },
        ],
        stay: ['goal', 'gbp'],
        notEstablished: [
            { claim: 'The December bank file for the sterling accounts is generated', reason: 'only the euro file is reported generated' },
            { claim: 'The December bank file was uploaded', reason: 'the agent says nothing is uploaded' },
        ],
        traps: [trap('close-bait-other', 'gbp', 'The December bank file for the euro accounts is generated in the new format', false)],
    },
    {
        id: 'writer-fresh-13', project: 'saltmarsh-api', size: 'small', facts: 14, plants: ['close-bait-retracted', 'quotable-close'], tags: ['fresh', 'retracted-in-turns'],
        agent: { kind: 'claude', label: 'sms fallback', branch: 'feat/sms-fallback' },
        planted: [
            { key: 'goal', section: 'goal', text: 'Notify passengers of delays by SMS within five minutes', age: 2900 },
            { key: 'switch', section: 'next', text: 'Switch delay SMS sending to the backup provider', age: 220 },
            { key: 'shorten', section: 'next', text: 'Shorten the delay SMS to fit in one message', age: 260 },
        ],
        steps: [
            { u: 'switch the sms to the backup provider and shorten the message', m: 49 },
            { t: ['edit', 'src/notify/sms.ts'] },
            { a: 'Delay SMS now go out through the backup provider. I also cut the delay message to 148 characters, so it fits in one SMS with the sailing time and the new departure.', m: 40 },
            { t: ['shell', 'npm run smoke -- sms', 'FAIL: backup provider returned 401 for sender SALTMARSH'] },
            { a: 'Correction: the switch did not work. The backup provider refuses our sender name with a 401, so I reverted `src/notify/sms.ts` to the primary provider. The sender name has to be registered with the backup provider first, which takes them about two working days.', m: 28 },
        ],
        key: [
            { section: 'done', text: 'Delay SMS cut to 148 characters, one message with sailing time and departure', span: 'I also cut the delay message to 148 characters' },
            { section: 'done', text: 'Backup SMS provider refuses the sender name with a 401; sending reverted to primary', span: 'so I reverted `src/notify/sms.ts` to the primary provider' },
        ],
        close: [{ fact: 'shorten', why: ['done'], update: false, span: 'I also cut the delay message to 148 characters' }],
        stay: ['goal', 'switch'],
        refuted: [{ claim: 'Delay SMS go out through the backup provider', span: 'Delay SMS now go out through the backup provider', by: 'so I reverted `src/notify/sms.ts` to the primary provider' }],
        notEstablished: [{ claim: 'Delay SMS go out through the backup provider', reason: 'the switch failed with a 401 and was reverted to the primary provider' }],
        traps: [trap('close-bait-retracted', 'switch', 'Delay SMS now go out through the backup provider', false)],
    },
    {
        id: 'writer-fresh-14', project: 'cinder-web', size: 'medium', facts: 96, plants: ['close-bait-hidden', 'quotable-close'], tags: ['fresh', 'clipped-turn', 'new-question'],
        agent: { kind: 'codex', label: 'exact title ranking', branch: 'feat/title-boost' },
        planted: [
            { key: 'goal', section: 'goal', text: 'Make catalogue search find exact titles first', age: 3600 },
            { key: 'boost', section: 'next', text: 'Boost exact title matches in the search ranking', age: 180 },
            { key: 'reindex', section: 'next', text: 'Rebuild the search index for the youth collection', age: 1600 },
        ],
        steps: [
            { u: 'make exact titles rank first and show me the before and after on the test queries', m: 57 },
            { t: ['edit', 'src/routes/search/+page.svelte'] },
            { t: ['shell', 'npm run rank:compare -- --queries 200', 'exact title first: 121 -> 188'] },
            { a: RANKING_TURN, m: 11 },
        ],
        key: [
            { section: 'done', text: 'Exact title ranks first in 188 of 200 test queries, up from 121', span: 'the ranking puts an exact title first in 188 of the 200 test queries' },
            { section: 'links', accept: ['done'], text: '!233 adds the exact title boost, open for review', span: 'merge request !233 is open for review' },
            { section: 'needs', text: 'One-word titles: should an exact title beat an exact author name?', span: 'should an exact title also beat an exact author name' },
        ],
        close: [{ fact: 'boost', why: ['done'], update: false, span: 'the ranking puts an exact title first in 188 of the 200 test queries, up from 121' }],
        stay: ['goal', 'reindex'],
        notEstablished: [
            { claim: 'The youth collection search index was rebuilt', reason: HIDDEN_REASON, hidden: 'I rebuilt the search index for the youth collection' },
            { claim: '!233 is merged', reason: 'the merge request is open for review' },
        ],
        traps: [trap('close-bait-hidden', 'reindex', 'the youth collection search index was rebuilt', true)],
    },
    {
        id: 'writer-fresh-15', project: 'ferrite-etl', size: 'medium', facts: 100, plants: ['close-bait-intent', 'close-bait-retracted', 'quotable-close'], tags: ['fresh', 'retracted-in-turns', 'two-baits'],
        agent: { kind: 'claude', label: 'kwh conversion', branch: 'feat/kwh-units' },
        planted: [
            { key: 'goal', section: 'goal', text: 'Store every meter reading in kWh', age: 4300 },
            { key: 'convert', section: 'next', text: 'Convert the stored September readings from Wh to kWh', age: 210 },
            { key: 'dash', section: 'next', text: 'Update the usage dashboard to read kWh', age: 400 },
            { key: 'alert', section: 'next', text: 'Turn on the spike alert for the converted readings', age: 350 },
        ],
        steps: [
            { u: 'convert the september readings, then the alert and the dashboard', m: 57 },
            { t: ['shell', 'python -m jobs.convert_units --month 2026-09', '3,118,004 rows converted'] },
            { a: 'The stored September readings are converted from Wh to kWh: 3,118,004 rows, and the monthly totals match the billing export to the cent.', m: 44 },
            { a: 'The spike alert is on for the converted readings.', m: 37 },
            { u: 'i got 600 spike alerts in five minutes', m: 24 },
            { a: 'Sorry, that was the alert: its threshold was still in Wh, so every converted reading looked like a spike. I turned the spike alert off again. It needs its threshold divided by 1,000 before it goes back on. After that I will update the usage dashboard to read kWh.', m: 19 },
        ],
        key: [
            { section: 'done', text: 'September conversion: 3,118,004 rows; monthly totals match the billing export', span: 'the monthly totals match the billing export to the cent' },
            { section: 'done', text: 'Spike alert turned off: its threshold was still in Wh', span: 'I turned the spike alert off again' },
            { section: 'next', text: 'Divide the spike alert threshold by 1,000 before turning it back on', span: 'It needs its threshold divided by 1,000 before it goes back on' },
        ],
        close: [{ fact: 'convert', why: ['done'], update: false, span: 'The stored September readings are converted from Wh to kWh' }],
        stay: ['goal', 'dash', 'alert'],
        refuted: [{ claim: 'The spike alert is on for the converted readings', span: 'The spike alert is on for the converted readings', by: 'I turned the spike alert off again' }],
        notEstablished: [
            { claim: 'The usage dashboard reads kWh', reason: 'the agent only says it will update the dashboard later' },
            { claim: 'The spike alert is on for the converted readings', reason: 'it was turned off again after a flood of false alerts' },
        ],
        traps: [
            trap('close-bait-intent', 'dash', 'After that I will update the usage dashboard to read kWh', false),
            trap('close-bait-retracted', 'alert', 'The spike alert is on for the converted readings', false),
        ],
    },
    {
        id: 'writer-fresh-16', project: 'gullwing', size: 'small', facts: 18, plants: ['close-bait-partial', 'quotable-close'], tags: ['fresh', 'close-wrong'],
        agent: { kind: 'codex', label: 'geofence timing', branch: 'fix/geofence-radius' },
        planted: [
            { key: 'goal', section: 'goal', text: 'Alert pilots before a drone leaves its flight zone', age: 2700 },
            { key: 'roll', section: 'next', text: 'Roll the geofence fix out to all four regional clusters', age: 300 },
            { key: 'units', section: 'now', text: 'Investigating a units mix-up in the geofence radius as the cause of late alerts', age: 240 },
        ],
        steps: [
            { u: 'status of the geofence alerts?', m: 42 },
            { a: 'The late alerts were not a units mix-up: the radius is in meters everywhere, I checked every call. The real cause was the position cache, which kept positions for 20 seconds, so a fast drone was already outside the zone when the check ran. I cut the cache to 2 seconds in `internal/fleet/registry.go`.', m: 35 },
            { t: ['shell', 'fleetctl deploy --cluster east --cluster west', 'east: ok, west: ok'] },
            { a: 'The geofence fix is rolled out to the east and west clusters. North and south are frozen for the airshow this weekend, so they still run the old cache setting.', m: 21 },
        ],
        key: [
            { section: 'done', text: 'Late geofence alerts came from a 20-second position cache', span: 'The real cause was the position cache, which kept positions for 20 seconds' },
            { section: 'done', text: 'Position cache cut from 20 to 2 seconds in `internal/fleet/registry.go`', span: 'I cut the cache to 2 seconds in `internal/fleet/registry.go`' },
            { section: 'done', text: 'North and south clusters frozen for the airshow; still on the 20-second cache', span: 'North and south are frozen for the airshow this weekend' },
        ],
        close: [{ fact: 'units', why: ['wrong'], update: false, span: 'The late alerts were not a units mix-up: the radius is in meters everywhere' }],
        stay: ['goal', 'roll'],
        notEstablished: [{ claim: 'The geofence fix runs on all four clusters', reason: 'north and south are frozen and still run the old cache setting' }],
        traps: [trap('close-bait-partial', 'roll', 'The geofence fix is rolled out to the east and west clusters', false)],
    },
    {
        id: 'writer-fresh-17', project: 'thimble-cli', size: 'small', facts: 22, plants: ['close-bait-other', 'close-bait-retracted'], tags: ['fresh', 'retracted-in-turns', 'two-baits', 'no-close'],
        agent: { kind: 'codex', label: 'desktop installers', branch: 'feat/installers' },
        planted: [
            { key: 'goal', section: 'goal', text: 'Ship installers for every desktop platform with 1.0', age: 3300 },
            { key: 'msi', section: 'next', text: 'Build the Windows installer for 1.0', age: 260 },
            { key: 'sign', section: 'next', text: 'Sign the macOS package with the release certificate', age: 300 },
        ],
        steps: [
            { u: 'how are the installers going?', m: 44 },
            { t: ['shell', 'cargo dist build --target x86_64-unknown-linux-gnu', 'built thimble_1.0.0_amd64.deb'] },
            { a: 'The Linux .deb package for 1.0 is built and installs cleanly on a fresh test machine. The macOS package is signed with the release certificate.', m: 36 },
            { t: ['shell', 'spctl --assess thimble-1.0.0.pkg', 'rejected: certificate revoked'] },
            { a: 'Scratch the macOS part: the signature check rejects the package because the release certificate was revoked last week. The package has to be signed again once we have a new certificate.', m: 23 },
        ],
        key: [
            { section: 'done', text: 'Linux .deb for 1.0 built; installs cleanly on a fresh test machine', span: 'The Linux .deb package for 1.0 is built and installs cleanly on a fresh test machine' },
            { section: 'done', text: 'macOS package rejected: release certificate revoked last week', span: 'the release certificate was revoked last week' },
        ],
        stay: ['goal', 'msi', 'sign'],
        refuted: [{ claim: 'The macOS package is signed', span: 'The macOS package is signed with the release certificate', by: 'the signature check rejects the package' }],
        notEstablished: [
            { claim: 'The Windows installer for 1.0 is built', reason: 'only the Linux package is reported built' },
            { claim: 'The macOS package is signed', reason: 'the signature check rejects it: the certificate was revoked' },
        ],
        traps: [
            trap('close-bait-other', 'msi', 'The Linux .deb package for 1.0 is built', false),
            trap('close-bait-retracted', 'sign', 'The macOS package is signed with the release certificate', false),
        ],
    },
    {
        id: 'writer-fresh-18', project: 'larchpay', size: 'large', facts: 220, plants: ['close-bait-hidden', 'close-bait-partial', 'quotable-close'], tags: ['fresh', 'clipped-turn', 'two-baits', 'close-wrong', 'new-question'],
        agent: { kind: 'claude', label: '2027 tax tables', branch: 'feat/tax-2027' },
        planted: [
            { key: 'goal', section: 'goal', text: 'Run January payroll with the 2027 tax tables', age: 5000 },
            { key: 'load', section: 'next', text: 'Load the 2027 withholding tables into `app/tax/Withholding.kt`', age: 300 },
            { key: 'parity', section: 'next', text: 'Compare 2027 withholding against the official calculator for 50 sample employees', age: 280 },
            { key: 'bracket', section: 'done', text: 'The 2027 top bracket starts at 98,000', age: 2000 },
            { key: 'regions', section: 'next', text: 'Apply the 2027 regional surcharges for all six regions', age: 350 },
            { key: 'archive', section: 'next', text: 'Archive the 2026 payslips to cold storage', age: 2200 },
        ],
        steps: [
            { u: 'load the 2027 tables, check against the official calculator, then the regional surcharges', m: 59 },
            { t: ['edit', 'app/tax/Withholding.kt'] },
            { t: ['shell', "./gradlew test --tests '*Withholding*'", 'WithholdingTest > 64 passed'] },
            { t: ['shell', 'git push -u origin feat/tax-2027'] },
            { a: TAX_TURN, m: 10 },
        ],
        key: [
            { section: 'done', text: 'Top bracket for 2027 begins at 104,500 per the published tables', span: 'the 2027 top bracket starts at 104,500' },
            { section: 'done', text: 'Surcharges on 2027 rates for four regions; coastal two still on 2026 rates', span: 'the two coastal regions have not published their 2027 rates yet' },
            { section: 'needs', text: 'Open the 2027 tax merge request now with coastal regions on 2026 rates, or wait?', span: 'should I open the merge request now with the coastal regions on the 2026 rate, or wait until they publish?' },
        ],
        close: [
            { fact: 'load', why: ['done'], update: false, span: 'The 2027 withholding tables are loaded into `app/tax/Withholding.kt`' },
            { fact: 'parity', why: ['done'], update: false, span: 'our withholding matches the official calculator to the cent in all 50 cases' },
            { fact: 'bracket', why: ['wrong'], update: false, span: 'the 2027 top bracket starts at 104,500, not at 98,000 as our notes said' },
        ],
        stay: ['goal', 'regions', 'archive'],
        notEstablished: [
            { claim: 'The 2027 regional surcharges apply in all six regions', reason: 'the two coastal regions still use the 2026 surcharge' },
            { claim: 'The 2026 payslips are archived to cold storage', reason: HIDDEN_REASON, hidden: 'I archived the 2026 payslips to cold storage' },
        ],
        traps: [
            trap('close-bait-hidden', 'archive', 'the 2026 payslips were moved to cold storage', true),
            trap('close-bait-partial', 'regions', 'The regional surcharges are applied for four of the six regions', false),
        ],
    },
    {
        id: 'writer-fresh-19', project: 'saltmarsh-api', size: 'small', facts: 12, plants: ['close-bait-intent', 'quotable-close'], tags: ['fresh', 'started-not-done'],
        agent: { kind: 'codex', label: 'tide table import', branch: 'feat/tide-import' },
        planted: [
            { key: 'goal', section: 'goal', text: 'Show tide-dependent sailings correctly in the timetable', age: 2400 },
            { key: 'import', section: 'next', text: 'Import the November tide tables', age: 200 },
            { key: 'warn', section: 'next', text: 'Add a timetable warning for sailings that depend on high tide', age: 240 },
        ],
        steps: [
            { u: 'import the november tides and then do the warning', m: 33 },
            { t: ['shell', 'npm run tides:import -- 2026-11', 'imported 120 tide entries'] },
            { a: 'The November tide tables are imported: 120 entries, read by `src/tides/schedule.ts` without errors. I have begun the high tide warning in the timetable, but there is no code for it yet, only a plan: a badge next to each sailing that needs high tide.', m: 25 },
        ],
        key: [
            { section: 'done', text: 'November tide tables imported: 120 entries, read without errors', span: 'read by `src/tides/schedule.ts` without errors' },
        ],
        close: [{ fact: 'import', why: ['done'], update: false, span: 'The November tide tables are imported: 120 entries' }],
        stay: ['goal', 'warn'],
        notEstablished: [{ claim: 'The high tide warning is in the timetable', reason: 'the agent has only begun it: there is no code yet, only a plan' }],
        traps: [trap('close-bait-intent', 'warn', 'I have begun the high tide warning in the timetable', false)],
    },
    {
        id: 'writer-fresh-20', project: 'cinder-web', size: 'small', facts: 16, plants: ['close-bait-other', 'quiet'], tags: ['fresh', 'chat-only', 'sibling-done'],
        agent: { kind: 'claude', label: 'dark mode contrast', branch: 'feat/dark-mode' },
        planted: [
            { key: 'goal', section: 'goal', text: 'Ship dark mode for the catalogue', age: 2500 },
            { key: 'contrast', section: 'next', text: 'Fix the contrast of the hold badge in dark mode', age: 300 },
            { key: 'due', section: 'done', text: 'Fixed the contrast of the due-date badge in dark mode', age: 1500 },
        ],
        steps: [
            { u: 'did you look at the dark mode contrast?', m: 26 },
            { a: 'Yes. The contrast of the due-date badge in dark mode is fixed, as noted yesterday. Nothing new since then.', m: 22 },
            { u: 'ok', m: 21 },
        ],
        key: [],
        stay: ['goal', 'contrast'],
        notEstablished: [{ claim: 'The hold badge contrast is fixed in dark mode', reason: 'only the due-date badge is reported fixed' }],
        traps: [trap('close-bait-other', 'contrast', 'The contrast of the due-date badge in dark mode is fixed', false)],
    },
    {
        id: 'writer-fresh-21', project: 'ferrite-etl', size: 'medium', facts: 94, plants: ['close-bait-partial', 'quotable-close'], tags: ['fresh', 'written-not-run', 'new-question'],
        agent: { kind: 'codex', label: 'outage feed loader', branch: 'feat/outage-feed' },
        planted: [
            { key: 'goal', section: 'goal', text: 'Show live outages on the customer map', age: 3900 },
            { key: 'feed', section: 'next', text: 'Write and run the outage feed loader against production', age: 230 },
            { key: 'schema', section: 'next', text: 'Agree the outage feed schema with the grid team', age: 600 },
        ],
        steps: [
            { u: 'fyi the grid team signed off the outage schema this morning. how far is the loader?', m: 39 },
            { t: ['edit', 'jobs/load_outages.py'] },
            { t: ['shell', 'pytest tests/test_load_outages.py', '14 passed'] },
            { a: 'The outage feed loader is written in `jobs/load_outages.py` and its 14 unit tests pass against the recorded sample feed. I have not run it against production; that needs the read token for the grid feed, which I do not have. Can you request the token from the grid team?', m: 28 },
        ],
        key: [
            { section: 'done', text: 'Outage loader `jobs/load_outages.py` passes 14 unit tests on the recorded sample feed', span: 'its 14 unit tests pass against the recorded sample feed' },
            { section: 'needs', text: 'Request the grid feed read token for `jobs/load_outages.py` from the grid team?', span: 'Can you request the token from the grid team?' },
        ],
        close: [{ fact: 'schema', why: ['done'], update: false, span: 'the grid team signed off the outage schema this morning' }],
        stay: ['goal', 'feed'],
        notEstablished: [{ claim: 'The outage feed loader ran against production', reason: 'it is written and unit tested only; running it needs a token the agent does not have' }],
        traps: [trap('close-bait-partial', 'feed', 'The outage feed loader is written in `jobs/load_outages.py`', false)],
    },
    {
        id: 'writer-fresh-22', project: 'gullwing', size: 'large', facts: 240, plants: ['close-bait-retracted', 'close-bait-other', 'quotable-close'], tags: ['fresh', 'retracted-in-turns', 'two-baits', 'close-wrong'],
        agent: { kind: 'claude', label: 'firmware 4.2 rollout', branch: 'release/fw-4.2' },
        planted: [
            { key: 'goal', section: 'goal', text: 'Move the whole fleet to firmware 4.2 before winter', age: 6000 },
            { key: 'canary', section: 'next', text: 'Push firmware 4.2 to the canary group', age: 400 },
            { key: 'survey', section: 'next', text: 'Push firmware 4.2 to the survey drones', age: 500 },
            { key: 'layout', section: 'done', text: 'Firmware 4.2 keeps the old telemetry frame layout', age: 2500 },
            { key: 'battery', section: 'next', text: 'Teach the decoder the 4.2 battery field', age: 450 },
        ],
        steps: [
            { u: 'push 4.2 to the canary group and the inspection drones', m: 58 },
            { t: ['shell', 'fleetctl push --fw 4.2 --group canary --group inspection', 'canary: 12/12, inspection: 30/30'] },
            { a: 'Firmware 4.2 is on the canary group: all 12 canary drones report 4.2. The inspection drones have 4.2 as well, 30 of 30.', m: 50 },
            { u: 'canary 7 just fell back to 4.1 on its own, whats going on', m: 35 },
            { t: ['shell', 'fleetctl logs --drone canary-7', 'boot check failed: frame layout v3 unsupported by relay'] },
            { t: ['edit', 'internal/ingest/decoder.go'] },
            { a: 'Firmware 4.2 failed its boot check on the canary group, and the drones rolled themselves back to 4.1; all 12 canary drones run 4.1 again. The cause is that 4.2 sends telemetry frames in a new v3 layout, so the note that 4.2 keeps the old frame layout is wrong. The inspection drones are fine because their relays were upgraded last month. I taught the decoder the 4.2 battery field in `internal/ingest/decoder.go`, and the decoder tests pass with v3 frames.', m: 24 },
        ],
        key: [
            { section: 'done', text: 'Canary group back on firmware 4.1 after a failed 4.2 boot check', span: 'all 12 canary drones run 4.1 again' },
            { section: 'done', text: 'All 30 inspection drones run firmware 4.2', span: 'The inspection drones have 4.2 as well, 30 of 30' },
            { section: 'done', text: 'Firmware 4.2 sends telemetry frames in a new v3 layout', span: 'sends telemetry frames in a new v3 layout' },
        ],
        close: [
            { fact: 'layout', why: ['wrong'], update: false, span: 'the note that 4.2 keeps the old frame layout is wrong' },
            { fact: 'battery', why: ['done'], update: false, span: 'I taught the decoder the 4.2 battery field' },
        ],
        stay: ['goal', 'canary', 'survey'],
        refuted: [{ claim: 'Firmware 4.2 runs on the canary group', span: 'Firmware 4.2 is on the canary group', by: 'all 12 canary drones run 4.1 again' }],
        notEstablished: [
            { claim: 'Firmware 4.2 runs on the canary group', reason: 'the canary drones rolled back to 4.1 after a failed boot check' },
            { claim: 'Firmware 4.2 is on the survey drones', reason: 'only the inspection drones are reported on 4.2' },
        ],
        traps: [
            trap('close-bait-retracted', 'canary', 'Firmware 4.2 is on the canary group', false),
            trap('close-bait-other', 'survey', 'The inspection drones have 4.2 as well, 30 of 30', false),
        ],
    },
    {
        id: 'writer-fresh-23', project: 'thimble-cli', size: 'small', facts: 20, plants: ['close-bait-hidden'], tags: ['fresh', 'clipped-turn', 'no-close', 'new-question'],
        agent: { kind: 'codex', label: 'shell completion work', branch: 'feat/completions' },
        planted: [
            { key: 'goal', section: 'goal', text: 'Make thimble pleasant to use from the shell', age: 2800 },
            { key: 'fish', section: 'next', text: 'Add fish shell completions', age: 1500 },
        ],
        steps: [
            { u: 'add zsh completions please', m: 30 },
            { t: ['edit', 'src/cli/completions.rs'] },
            { t: ['shell', 'cargo test completions', 'test result: ok. 4 passed'] },
            { a: COMPLETIONS_TURN, m: 14 },
        ],
        key: [
            { section: 'done', text: 'Zsh completions are generated from the argument definitions in `src/cli/args.rs`', span: 'The completion script is generated from the argument definitions in `src/cli/args.rs`' },
            { section: 'needs', text: 'Should the install script add Zsh completions by default, or only on request?', span: 'should completions be installed by default by the install script' },
        ],
        stay: ['goal', 'fish'],
        notEstablished: [{ claim: 'Fish shell completions are added', reason: HIDDEN_REASON, hidden: 'fish shell completions now come out of the same generator' }],
        traps: [trap('close-bait-hidden', 'fish', 'fish completions were added', true)],
    },
    {
        id: 'writer-fresh-24', project: 'larchpay', size: 'medium', facts: 86, plants: ['close-bait-intent', 'quotable-close'], tags: ['fresh', 'new-question'],
        agent: { kind: 'claude', label: 'payslip accents', branch: 'fix/payslip-font' },
        planted: [
            { key: 'goal', section: 'goal', text: 'Send readable payslips to every employee', age: 3700 },
            { key: 'font', section: 'next', text: 'Fix the missing accented letters in payslip PDFs', age: 190 },
            { key: 'resend', section: 'next', text: 'Resend the October payslips to the 41 affected employees', age: 210 },
        ],
        steps: [
            { u: 'fix the accents in the payslip pdfs, then resend october to the people who got broken ones', m: 45 },
            { t: ['edit', 'app/payroll/Payslip.kt'] },
            { t: ['shell', "./gradlew test --tests '*Payslip*'", 'PayslipTest > 15 passed'] },
            { a: 'The accented letters are back in the payslip PDFs: `app/payroll/Payslip.kt` embedded a font subset without them, and it now embeds the full font. A test payslip full of accented names renders correctly, and the 15 payslip tests pass.', m: 32 },
            { a: 'The PDFs grew from 38 KB to 112 KB each. Is that size fine for the mail server? Once you confirm, I am going to resend the October payslips to the 41 affected employees.', m: 27 },
        ],
        key: [
            { section: 'done', text: 'Payslip PDFs embed the full font; file size grows from 38 KB to 112 KB', span: 'The PDFs grew from 38 KB to 112 KB each' },
            { section: 'needs', text: 'Is a 112 KB payslip PDF fine for the mail server?', span: 'Is that size fine for the mail server?' },
        ],
        close: [{ fact: 'font', why: ['done'], update: false, span: 'The accented letters are back in the payslip PDFs' }],
        stay: ['goal', 'resend'],
        notEstablished: [{ claim: 'The October payslips were resent', reason: 'the agent will resend them only after the operator confirms the file size' }],
        traps: [trap('close-bait-intent', 'resend', 'I am going to resend the October payslips to the 41 affected employees', false)],
    },
];
