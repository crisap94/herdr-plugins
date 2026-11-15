import { PROJECTS, a, ed, extend, f, rd, sh, sumA, sumU, u } from './pools.ts';
import { MORE } from './more.ts';
import type { E, F, ProjectName } from './pools.ts';

export interface Case {
    readonly id: string;
    readonly plants: readonly string[];
    readonly size: 'small' | 'medium' | 'large';
    readonly project: ProjectName;
    readonly now: string;
    readonly facts: readonly F[];
    readonly tail: readonly E[];
    readonly close?: readonly { k: string; why: readonly string[]; evidence: string }[];
    readonly update?: readonly { k: string; text: string; evidence: string }[];
    readonly dup?: readonly (readonly [string, string])[];
    readonly look?: readonly { k: string; span: string }[];
    readonly claims?: readonly { k: string; span: string }[];
    readonly note: string;
}

extend(MORE);

const bg = (project: ProjectName, ...keys: string[]): F[] => keys.map((k) => {
    const found = PROJECTS[project].bg.find((each) => each.k === k);
    if (found === undefined) throw new Error(`${project} has no ${k}`);
    return found;
});
const all = (project: ProjectName): F[] => [...PROJECTS[project].bg];
const chat = (project: ProjectName, ...at: number[]): E[] => at.flatMap((index) => {
    const found = PROJECTS[project].chat[index];
    if (found === undefined) throw new Error(`${project} has no chat ${index}`);
    return [...found];
});
const between = (list: readonly F[], inserts: Readonly<Record<number, F>>): F[] => list.flatMap((each, index) => (inserts[index] === undefined ? [each] : [inserts[index] as F, each]));

const CONTINUED = 'This session is being continued from a previous conversation that ran out of context. The summary below covers the earlier portion of the conversation.\n\nSummary:\n';

export const CASES: readonly Case[] = [
    {
        id: 'rec-01-stale-easy-done', plants: ['stale', 'easy'], size: 'small', project: 'brasswork', now: '2026-10-06T10:42:00Z',
        facts: [...bg('brasswork', 'b1'), f('dry', 'next', 'Add the --dry-run flag to the prune command'), ...bg('brasswork', 'b3')],
        tail: [
            u('Go ahead with the dry-run flag for prune. It should print what would be deleted and delete nothing.'),
            ed('src/commands/prune.rs'),
            sh('cargo test prune', '9 passed; 0 failed'),
            a('The --dry-run flag is added to the prune command: it prints every file that would be deleted and deletes nothing. Two new tests cover it and all 9 prune tests pass.'),
        ],
        close: [{ k: 'dry', why: ['done'], evidence: 'The --dry-run flag is added to the prune command' }],
        note: 'Plain case: one next fact, the last agent turn says it is added and tested.',
    },
    {
        id: 'rec-02-stale-easy-answered', plants: ['stale', 'easy'], size: 'small', project: 'lantern', now: '2026-10-08T14:05:00Z',
        facts: [f('side', 'needs', 'Operator must choose whether the settings sidebar starts collapsed or open'), ...bg('lantern', 'goal', 'b4')],
        tail: [
            a('Before I wire the sidebar: should it start collapsed or open on the settings page?'),
            u('Start it collapsed. People can open it when they need it.'),
            a('Understood, the sidebar starts collapsed. I will wire it that way.'),
        ],
        close: [{ k: 'side', why: ['answered'], evidence: 'Start it collapsed' }],
        note: 'Plain case: a needs fact, the operator answers in the next turn.',
    },
    {
        id: 'rec-03-stale-superseded-decision', plants: ['stale', 'lookalike'], size: 'medium', project: 'orchard', now: '2026-10-13T09:18:00Z',
        facts: [
            ...bg('orchard', 'goal', 'b1', 'b2'),
            f('redis', 'decisions', 'Keep the rate limit counters in Redis', { why: 'the three API pods must share one count' }),
            ...bg('orchard', 'b7', 'b8', 'b9'),
            f('hdr', 'next', 'Return the remaining quota in a response header'),
            ...bg('orchard', 'b12'),
        ],
        tail: [
            ...chat('orchard', 10, 0, 1),
            u('Change of plan on the rate limits: Redis is leaving the cluster at the end of the month, so the counters cannot stay there. Keep them in Postgres instead, one row per API key and minute.'),
            ed('src/limits/store.ts'),
            sh('bun test test/limits', '27 pass, 0 fail'),
            a('Done as far as the storage goes: the rate limit counters now live in Postgres, one row per API key and minute, and the Redis client is removed from the limiter. The three pods still share one count because they share the database. The response header with the remaining quota is not started yet.'),
            ...chat('orchard', 2),
        ],
        close: [{ k: 'redis', why: ['superseded'], evidence: 'the rate limit counters now live in Postgres' }],
        look: [{ k: 'hdr', span: 'The response header with the remaining quota is not started yet' }],
        note: 'The operator replaces a decision; closing it as superseded or updating it to Postgres both count. The same agent turn names the header fact and says it is not started.',
    },
    {
        id: 'rec-04-stale-wrong-cause', plants: ['stale', 'lookalike'], size: 'medium', project: 'tidewater', now: '2026-10-15T16:30:00Z',
        facts: [
            ...bg('tidewater', 'goal', 'b1', 'b2'),
            f('cause', 'done', 'Found the cause of the duplicate rows: the nightly job runs twice'),
            ...bg('tidewater', 'b4', 'b5'),
            f('fix', 'next', 'Remove the duplicate rows from the warehouse orders table'),
            ...bg('tidewater', 'b6', 'b13'),
        ],
        tail: [
            ...chat('tidewater', 11, 0),
            u('Before you change the scheduler: are we sure the nightly job really runs twice? Check the run history.'),
            sh('tw runs list orders-nightly --last 14', '14 runs in 14 nights, one per night, no overlap'),
            sh('rg -n "resend" pipeline/load.py', 'pipeline/load.py:88: resend the batch after a timeout'),
            a('I was wrong about the nightly job: the run history shows exactly one run per night for the last 14 nights. The duplicate rows come from the loader instead: after a timeout it sends the same batch again, although the first attempt had already been written. So the scheduler is fine and needs no change. The duplicate rows are still in the warehouse; nothing has been removed yet.'),
            ...chat('tidewater', 3),
        ],
        close: [{ k: 'cause', why: ['wrong'], evidence: 'I was wrong about the nightly job' }],
        look: [{ k: 'fix', span: 'nothing has been removed yet' }],
        note: 'A recorded finding turns out wrong; closing it as wrong or updating it to the loader cause both count. The removal of the rows is named and explicitly not done.',
    },
    {
        id: 'rec-05-stale-update-count', plants: ['stale', 'update', 'lookalike'], size: 'medium', project: 'mossgate', now: '2026-10-20T11:50:00Z',
        facts: [
            ...bg('mossgate', 'goal', 'b1'),
            f('routes', 'next', 'Move the 14 remaining routes to the new auth middleware'),
            ...bg('mossgate', 'b3', 'b4', 'b5'),
            f('store', 'next', 'Delete the old session store once no route reads it'),
            ...bg('mossgate', 'b7'),
        ],
        tail: [
            ...chat('mossgate', 0),
            u('How far are we with the routes?'),
            sh('rg -c "legacyAuth" internal/routes', 'internal/routes/admin.go:5'),
            a('9 of the 14 routes are on the new auth middleware now. The 5 that remain are the admin routes in internal/routes/admin.go; they need the scoped tokens for operators first. The old session store is still read by those 5, so it stays for now.'),
            ...chat('mossgate', 1),
        ],
        update: [{ k: 'routes', text: 'Move the 5 remaining admin routes to the new auth middleware', evidence: 'The 5 that remain are the admin routes' }],
        look: [{ k: 'store', span: 'The old session store is still read by those 5' }],
        note: 'The fact changed (14 routes became 5) but is not finished: it must be updated, and a close loses it.',
    },
    {
        id: 'rec-06-stale-two-of-many', plants: ['stale'], size: 'large', project: 'orchard', now: '2026-10-22T17:26:00Z',
        facts: [
            ...between(all('orchard'), {
                6: f('pdf', 'needs', 'Operator must say whether PDF invoices keep the old logo or get the new one'),
                15: f('idx', 'next', 'Add an index on invoices(customer_id, sent_at) for the list endpoint'),
                21: f('hook', 'next', 'Add contract tests for the payment webhooks'),
            }),
        ],
        tail: [
            ...chat('orchard', 12, 13, 8, 9, 0, 1, 2, 3, 4),
            a('One open point before I regenerate the PDF templates: do the invoices keep the old logo or get the new one?'),
            u('Use the new logo on everything generated from now on. Old invoices stay as they are.'),
            a('Noted: the new logo goes on newly generated PDFs, and invoices that were already sent are not touched.'),
            ...chat('orchard', 5, 10),
            u('The list endpoint is still slow for the big customers. Do the index now.'),
            ed('migrations/0043_invoice_list_index.sql'),
            sh('bun run migrate:up', '0043_invoice_list_index applied'),
            sh('bun run load:invoice-list', 'p95 61 ms (was 840 ms)'),
            a('The index on invoices(customer_id, sent_at) is in place with migration 0043 and its down script. For the largest customer the list endpoint went from 840 ms to 61 ms at p95 in the load test.'),
            ...chat('orchard', 6, 11, 7),
        ],
        close: [
            { k: 'pdf', why: ['answered'], evidence: 'Use the new logo on everything generated from now on' },
            { k: 'idx', why: ['done'], evidence: 'The index on invoices(customer_id, sent_at) is in place with migration 0043' },
        ],
        note: 'Two stale facts among 28; the tail is longer than the 12,000 character budget, so the oldest turns are omitted by the plugin.',
    },
    {
        id: 'rec-07-stale-with-duplicate', plants: ['stale', 'duplicate'], size: 'medium', project: 'kiteline', now: '2026-10-27T08:40:00Z',
        facts: [
            ...bg('kiteline', 'goal', 'b1'),
            f('t1', 'now', 'Running the offline sync tests on the Android tablet'),
            ...bg('kiteline', 'b3'),
            f('t2', 'now', 'Offline sync tests are running on the Android tablet'),
            ...bg('kiteline', 'b4', 'b5'),
            f('ios', 'next', 'Enable background sync on iOS'),
            ...bg('kiteline', 'b7'),
        ],
        tail: [
            ...chat('kiteline', 0),
            u('Turn on background sync for iOS now, the entitlement came through this morning.'),
            ed('ios/Runner/Info.plist'),
            sh('xcodebuild test -scheme FieldApp -only-testing SyncTests', '31 tests passed'),
            a('Background sync is enabled on iOS: the app registers a background task with the system and the 31 sync tests pass on the simulator.'),
            ...chat('kiteline', 1),
        ],
        close: [{ k: 'ios', why: ['done'], evidence: 'Background sync is enabled on iOS' }],
        dup: [['t1', 't2']],
        note: 'Two open facts say the same thing in other words (a true duplicate: one may be merged into the other, with no evidence). The tail says nothing about them. One other fact is finished.',
    },
    {
        id: 'rec-08-stale-clipped-turn', plants: ['stale', 'lookalike'], size: 'large', project: 'tidewater', now: '2026-10-29T19:55:00Z',
        facts: [
            ...between(all('tidewater'), {
                9: f('march', 'next', 'Backfill the March orders into the production warehouse'),
                17: f('april', 'next', 'Backfill the April orders into the production warehouse'),
            }),
        ],
        tail: [
            ...chat('tidewater', 13, 8, 9, 0, 1, 2, 3, 4),
            u('Run the March backfill on production now, it is past 18:00. April waits until I have checked March.'),
            sh('tw backfill orders --month 2026-03 --target production', 'batch 83/83 done\nloaded 412,880 rows in 26 min 40 s'),
            sh('tw check row-counts --month 2026-03 --table orders', 'source 412,880 warehouse 412,880 OK'),
            a('Here is how the run went, step by step. The extract read the March files from the raw bucket in 4 minutes and found 83 files, one of them empty (the file of 17 March, a day without orders in the feed because the source system was down for maintenance). The transform step took 6 minutes; it rejected 212 lines, all of them test orders with the customer number 0, which the rules say to drop. The loader then wrote 83 batches of at most 5,000 rows. Two batches hit a timeout and were sent again; I checked both by their load_id and each is in the warehouse exactly once. The connection pool stayed below its limit of 12 the whole time, and the warehouse reported no lock waits. The whole run took 26 minutes and 40 seconds, of which about 16 minutes were the load itself. I also compared ten orders by hand between the source files and the warehouse: amounts, line counts and timestamps match. The March backfill is finished on production: 412,880 rows loaded and the row count check matches the source. April has not been started; it waits for your check of March.'),
            ...chat('tidewater', 5, 10, 6, 11, 12),
        ],
        close: [{ k: 'march', why: ['done'], evidence: 'The March backfill is finished on production' }],
        look: [{ k: 'april', span: 'April has not been started' }],
        note: 'The agent turn that settles the fact is longer than 1,200 characters, so the plugin clips its middle; the settling sentence is in the kept end. The sibling fact (April) is named as not started.',
    },
    {
        id: 'rec-09-lookalike-other-platform', plants: ['lookalike'], size: 'small', project: 'brasswork', now: '2026-10-07T13:12:00Z',
        facts: [f('win', 'next', 'Fix the failing path tests on Windows'), ...bg('brasswork', 'b5', 'b7')],
        tail: [
            u('Run the path tests again after your change.'),
            sh('cargo test path --target x86_64-unknown-linux-gnu', '22 passed; 0 failed'),
            sh('cargo test path --target x86_64-pc-windows-msvc', '19 passed; 3 failed'),
            a('The path tests pass on Linux now: 22 of 22. On Windows 3 of 22 still fail, all on paths that start with a drive letter.'),
        ],
        look: [{ k: 'win', span: 'The path tests pass on Linux now' }],
        note: 'The same tests pass on another platform; on Windows they still fail. Nothing may be closed.',
    },
    {
        id: 'rec-10-lookalike-not-answered', plants: ['lookalike'], size: 'small', project: 'lantern', now: '2026-10-09T15:33:00Z',
        facts: [
            f('tok', 'needs', 'Operator must approve the new colour tokens before the theme ships'),
            ...bg('lantern', 'b9', 'goal'),
            f('ctr', 'next', 'Write the contrast report for the new colour tokens'),
        ],
        tail: [
            a('The new colour tokens are ready for your approval. Shall I ship the theme?'),
            u('Not yet. Show me the contrast report first, then I will decide.'),
            a('Understood. I will write the contrast report and come back to you; the theme does not ship until you approve the tokens.'),
        ],
        look: [{ k: 'tok', span: 'Not yet. Show me the contrast report first, then I will decide' }, { k: 'ctr', span: 'I will write the contrast report' }],
        note: 'The operator replies to the question without answering it; the approval is still pending and the report is only promised.',
    },
    {
        id: 'rec-11-lookalike-plan-not-done', plants: ['lookalike', 'stale'], size: 'medium', project: 'orchard', now: '2026-10-14T10:07:00Z',
        facts: [
            ...bg('orchard', 'goal', 'b3'),
            f('idx', 'next', 'Add an index on invoices(customer_id) for the customer page'),
            ...bg('orchard', 'b8', 'b9'),
            f('mig', 'next', 'Write migration 0044 that adds the invoices.locale column'),
            ...bg('orchard', 'b13', 'b14'),
        ],
        tail: [
            ...chat('orchard', 12, 3),
            u('What is next on the database side?'),
            ed('migrations/0044_invoice_locale.sql'),
            ed('migrations/0044_invoice_locale.down.sql'),
            sh('bun run migrate:check', '0044 up and down apply cleanly'),
            a('Migration 0044 is written, with its down script: it adds the invoices.locale column and both directions apply cleanly on a fresh database. Done with that part. Next I will add the index on invoices(customer_id) for the customer page, in its own migration so it can be rolled back alone.'),
            ...chat('orchard', 5),
        ],
        close: [{ k: 'mig', why: ['done'], evidence: 'Migration 0044 is written, with its down script' }],
        look: [{ k: 'idx', span: 'Next I will add the index on invoices(customer_id) for the customer page' }],
        note: 'One fact is finished; right after "Done with that part" the agent names the other fact as a plan. The planned one stays open.',
    },
    {
        id: 'rec-12-lookalike-sibling-key', plants: ['lookalike'], size: 'medium', project: 'mossgate', now: '2026-10-22T09:45:00Z',
        facts: [
            ...bg('mossgate', 'goal', 'b2'),
            f('adm', 'next', 'Rotate the signing key of the admin tokens'),
            ...bg('mossgate', 'b4', 'b5', 'b9'),
            f('svc', 'done', 'Listed every service that verifies gateway tokens', { ref: 'docs/security/verifiers.md' }),
            ...bg('mossgate', 'b7'),
        ],
        tail: [
            ...chat('mossgate', 1),
            u('It is Thursday and the window is open. Rotate what we planned.'),
            sh('mossctl keys rotate --scope service', 'new key id svc-2026-11, old key valid for 24 h'),
            a('Rotated the signing key of the service tokens: the new key is svc-2026-11 and the old one stays valid for 24 hours so running services can refresh. The admin tokens keep their old key: their rotation needs two operators present, and only one is here today.'),
            ...chat('mossgate', 2),
        ],
        look: [{ k: 'adm', span: 'Rotated the signing key of the service tokens' }],
        note: 'A sibling key (service tokens) was rotated; the admin key was not. Nothing may be closed.',
    },
    {
        id: 'rec-13-lookalike-staging-only', plants: ['lookalike'], size: 'medium', project: 'tidewater', now: '2026-10-16T14:31:00Z',
        facts: [
            ...bg('tidewater', 'goal', 'b1', 'b5', 'b6'),
            f('feb', 'next', 'Backfill the February orders into the production warehouse'),
            ...bg('tidewater', 'b11', 'b13', 'b18'),
            f('range', 'needs', 'Operator must confirm the date range of the February backfill'),
        ],
        tail: [
            ...chat('tidewater', 1),
            u('Try the February backfill on staging first so we see how long it takes.'),
            sh('tw backfill orders --month 2026-02 --target staging', 'loaded 371,204 rows in 14 min 10 s'),
            a('The February backfill ran against the staging warehouse at 14:10 and took 14 minutes for 371,204 rows. Production is untouched. For production I still need you to confirm the date range: the whole month, or only from 9 February when the new feed started?'),
            ...chat('tidewater', 3, 10),
        ],
        look: [
            { k: 'feb', span: 'The February backfill ran against the staging warehouse' },
            { k: 'range', span: 'I still need you to confirm the date range' },
            { k: 'b5', span: 'ran against the staging warehouse at 14:10' },
        ],
        note: 'The backfill ran on staging only, the question is asked again and not answered, and the daytime rule is about production. Nothing may be closed.',
    },
    {
        id: 'rec-14-lookalike-two-in-large', plants: ['lookalike'], size: 'large', project: 'orchard', now: '2026-10-23T12:14:00Z',
        facts: [
            ...between(all('orchard'), {
                4: f('ret', 'needs', 'Operator must pick the retention of the audit logs: 30 or 90 days'),
                19: f('exp', 'next', 'Ship the CSV export endpoint to production'),
            }),
        ],
        tail: [
            ...chat('orchard', 13, 8, 7, 0, 1, 2),
            u('For the access logs of the API, keep 30 days. That is enough for debugging.'),
            ed('ops/logging/retention.yaml'),
            a('The access logs are kept for 30 days now. That setting does not cover the audit logs, which have their own policy; their retention is still for you to pick, 30 or 90 days.'),
            ...chat('orchard', 4, 10, 9, 5),
            u('Does the CSV export work yet?'),
            sh('curl -s -o /dev/null -w "%{http_code}" https://api.staging.orchard.test/v3/exports/invoices.csv', '200'),
            a('The CSV export endpoint works on staging: an export of 40,000 rows streams in 6 seconds and the file opens cleanly in a spreadsheet. It is not on production yet; that needs the release on Monday.'),
            ...chat('orchard', 6, 11),
        ],
        look: [
            { k: 'ret', span: 'For the access logs of the API, keep 30 days' },
            { k: 'exp', span: 'The CSV export endpoint works on staging' },
        ],
        note: 'Two look-alikes among 27 facts: the operator picks a retention, but for another kind of log; the endpoint works, but on staging. Nothing may be closed.',
    },
    {
        id: 'rec-15-lookalike-asked-not-fixed', plants: ['lookalike'], size: 'small', project: 'kiteline', now: '2026-10-28T11:20:00Z',
        facts: [f('cert', 'now', 'Blocked: the push notification certificate has expired'), ...bg('kiteline', 'b4', 'b9')],
        tail: [
            u('Is the push certificate renewed yet?'),
            sh('fastlane pem --development false', 'error: certificate request pending approval'),
            a('Not yet. The renewal request is still pending with the store, so push notifications stay broken on new installs. Nothing is fixed on our side.'),
        ],
        look: [{ k: 'cert', span: 'Is the push certificate renewed yet' }],
        note: 'The tail speaks of the fact only to say it is unchanged. Nothing may be closed.',
    },
    {
        id: 'rec-16-lookalike-tagged-not-published', plants: ['lookalike', 'stale'], size: 'medium', project: 'brasswork', now: '2026-10-30T16:02:00Z',
        facts: [
            ...bg('brasswork', 'goal', 'b1'),
            f('pub', 'next', 'Publish version 0.9.0 to the package registry'),
            ...bg('brasswork', 'b3'),
            f('chg', 'next', 'Write the changelog entry for 0.9.0'),
            ...bg('brasswork', 'b4', 'b5', 'b9'),
        ],
        tail: [
            ...chat('brasswork', 0),
            u('Prepare 0.9.0: changelog, tag, publish.'),
            ed('CHANGELOG.md'),
            sh('git tag v0.9.0'),
            sh('cargo publish', 'error: no token found for the registry'),
            a('The changelog entry for 0.9.0 is written and committed, and the tag v0.9.0 exists locally. Version 0.9.0 is not published: the registry refused because no token is configured on this machine. I did not push the tag either, since that touches the release branch and needs your approval.'),
            ...chat('brasswork', 2),
        ],
        close: [{ k: 'chg', why: ['done'], evidence: 'The changelog entry for 0.9.0 is written and committed' }],
        look: [{ k: 'pub', span: 'the tag v0.9.0 exists locally' }],
        note: 'In one turn: the changelog is done, the version is tagged but explicitly not published. Close one, keep the other.',
    },
    {
        id: 'rec-17-compaction-claims-done', plants: ['compaction'], size: 'small', project: 'lantern', now: '2026-10-10T09:28:00Z',
        facts: [f('kbd', 'next', 'Finish keyboard navigation of the date picker: arrow keys and Escape'), ...bg('lantern', 'b4', 'goal')],
        tail: [
            sumU(`${CONTINUED}1. The work is the redesign of the settings page with the new tokens.\n2. The date picker was rebuilt on the shared popover.\n3. Keyboard navigation of the date picker is finished: arrow keys and Escape work and all tests pass.\n4. Next: the time zone selector.`),
            a('Picking up where the summary ends. I am reading the date picker and its tests to see where things stand.'),
            rd('src/components/DatePicker.tsx'),
            sh('bun test src/components/DatePicker.test.tsx', '14 pass, 2 todo'),
            a('The date picker tests run: 14 pass and 2 are marked todo. I will look at the two todo cases next.'),
        ],
        claims: [{ k: 'kbd', span: 'Keyboard navigation of the date picker is finished' }],
        note: 'Only the summary written after the compaction says the fact is finished; no real turn does. Nothing may be closed.',
    },
    {
        id: 'rec-18-compaction-omits-decision', plants: ['compaction'], size: 'small', project: 'orchard', now: '2026-10-12T18:03:00Z',
        facts: [
            f('limit', 'decisions', 'Keep the rate limit at 600 requests per minute per API key', { why: 'the largest client peaks at 450' }),
            ...bg('orchard', 'b19'),
            f('msg', 'needs', 'Operator must approve the wording of the 429 error message'),
        ],
        tail: [
            sumU(`${CONTINUED}1. The task is version 3 of the invoicing API.\n2. Cursor pagination is merged.\n3. The invoice list endpoint was load tested.\n4. Current work: the upgrade notes for clients.`),
            a('Continuing with the upgrade notes for clients of the v2 API.'),
            ed('docs/upgrade-v3.md'),
            a('The first section of the upgrade notes is drafted: it explains how a client moves from page numbers to cursors.'),
        ],
        note: 'The known failure: the summary leaves every open fact out. A fact that a summary omits is not wrong. No operation is expected.',
    },
    {
        id: 'rec-19-compaction-claims-answered', plants: ['compaction', 'lookalike'], size: 'medium', project: 'mossgate', now: '2026-10-21T15:17:00Z',
        facts: [
            ...bg('mossgate', 'goal', 'b1'),
            f('timeout', 'needs', 'Operator must approve the session timeout: 15 or 60 minutes'),
            ...bg('mossgate', 'b4', 'b5'),
            f('refresh', 'next', 'Add refresh tokens to the mobile login flow'),
            ...bg('mossgate', 'b6', 'b8'),
        ],
        tail: [
            sumU(`${CONTINUED}1. The goal is to move every route of the gateway to the new auth middleware and retire the old session store.\n2. The new middleware with scoped tokens is written and covered by tests.\n3. Audit events exist for login, logout and token refresh.\n4. Login attempts are limited to 20 per minute per address.\n5. The operator approved a session timeout of 15 minutes.\n6. Refresh tokens for the mobile login flow are in progress.\n7. Files touched most: internal/auth/middleware.go, internal/handlers/login.go, internal/tokens/refresh.go.`),
            a('Continuing from the summary. I am in the mobile login flow, on the refresh tokens.'),
            ...chat('mossgate', 0, 3),
            u('Where are the refresh tokens at?'),
            sh('go test ./internal/tokens -run Refresh', 'ok 11 tests'),
            a('Status of the refresh tokens: the token endpoint issues them and its 11 tests pass, but the mobile client does not store them yet, so the login flow still asks for the password after 15 minutes.'),
        ],
        claims: [{ k: 'timeout', span: 'The operator approved a session timeout of 15 minutes' }],
        look: [{ k: 'refresh', span: 'the token endpoint issues them and its 11 tests pass' }],
        note: 'The summary claims the operator answered; no real turn holds that answer. The other fact is half done. Nothing may be closed.',
    },
    {
        id: 'rec-20-compaction-one-confirmed', plants: ['compaction', 'stale'], size: 'medium', project: 'tidewater', now: '2026-10-30T07:48:00Z',
        facts: [
            ...bg('tidewater', 'goal', 'b2'),
            f('march', 'next', 'Backfill the March orders into the warehouse'),
            ...bg('tidewater', 'b5'),
            f('returns', 'next', 'Reload the returns table for March'),
            ...bg('tidewater', 'b6', 'b13', 'b4'),
        ],
        tail: [
            sumU(`${CONTINUED}1. The pipeline work is about loading a full day of orders quickly and without duplicates.\n2. The loader works in batches of 5,000 rows.\n3. The March orders backfill is complete.\n4. The returns table for March has been reloaded.\n5. Remaining: write up the results for the data team.`),
            a('Continuing. I will verify the state of the warehouse before I write anything up.'),
            sh('tw check row-counts --month 2026-03 --table orders', 'source 412,880 warehouse 412,880 OK'),
            sh('tw check row-counts --month 2026-03 --table returns', 'source 9,114 warehouse 0 MISMATCH'),
            a('Checked against the warehouse. The March backfill of orders finished: 412,880 rows in the source and 412,880 in the warehouse. The returns table is a different story: the warehouse holds 0 rows for March against 9,114 in the source, so that reload did not happen.'),
            ...chat('tidewater', 4, 12),
        ],
        close: [{ k: 'march', why: ['done'], evidence: 'The March backfill of orders finished' }],
        claims: [{ k: 'march', span: 'The March orders backfill is complete' }, { k: 'returns', span: 'The returns table for March has been reloaded' }],
        note: 'The summary claims two facts done. A real turn confirms one (close it, quoting the real turn) and contradicts the other (keep it).',
    },
    {
        id: 'rec-21-compaction-contradicted', plants: ['compaction'], size: 'medium', project: 'kiteline', now: '2026-10-29T13:36:00Z',
        facts: [
            ...bg('kiteline', 'goal', 'b1'),
            f('crash', 'now', 'The app crashes at login on the tablet build'),
            ...bg('kiteline', 'b4', 'b5'),
            f('qa', 'next', 'Send build 212 to the QA group'),
            ...bg('kiteline', 'b7', 'b9'),
        ],
        tail: [
            sumU(`${CONTINUED}1. The field app is being made usable offline.\n2. The queue of pending edits and the conflict screen exist.\n3. The first sync shrank from 48 MB to 9 MB.\n4. The crash at login on the tablet build was fixed by moving the token read off the main thread.\n5. Build 212 was sent to the QA group.\n6. Next: background sync on iOS.`),
            a('Continuing after the summary. First I check the tablet build.'),
            sh('./gradlew connectedTabletDebugAndroidTest', 'LoginTest > opensHome FAILED: process crashed'),
            a('The crash at login still reproduces on the tablet build: the login test dies with a crashed process. The change that moved the token read is in the branch, but it did not cure this.'),
            u('And build 212, did QA get it?'),
            sh('fastlane run latest_testflight_build_number', '211'),
            a('No. The latest build that QA has is 211; build 212 was never uploaded.'),
            ...chat('kiteline', 1),
        ],
        claims: [
            { k: 'crash', span: 'The crash at login on the tablet build was fixed' },
            { k: 'qa', span: 'Build 212 was sent to the QA group' },
        ],
        note: 'The summary claims two facts done and real turns after it say the opposite for both. Nothing may be closed.',
    },
    {
        id: 'rec-22-compaction-agent-summary', plants: ['compaction', 'stale'], size: 'large', project: 'orchard', now: '2026-10-24T20:11:00Z',
        facts: [
            ...between(all('orchard').filter((each) => each.k !== 'b24'), {
                7: f('wh', 'next', 'Add contract tests for the payment webhooks'),
                13: f('pdf', 'next', 'Move PDF rendering to the worker queue'),
                20: f('cur', 'needs', 'Operator must decide whether cursors expire after 24 hours'),
            }),
        ],
        tail: [
            ...chat('orchard', 8, 0),
            u('Do the webhook contract tests now.'),
            ed('test/contract/webhooks.test.ts'),
            sh('bun test test/contract', '18 pass, 0 fail'),
            a('The contract tests for the payment webhooks are added: 18 cases covering the four event types, and they pass against the recorded payloads.'),
            ...chat('orchard', 1),
            sumA('Context compacted. Summary of the session so far, written by the agent to carry on from:\n- Contract tests for the payment webhooks: added, 18 cases.\n- PDF rendering: moved to the worker queue.\n- Cursors: the operator decided that they expire after 24 hours.\n- Mailer templates: customerName everywhere.\n- Test helpers: unused imports removed.\n- Next: the upgrade notes for clients.'),
            ...chat('orchard', 3, 10, 4),
            u('What about PDF rendering?'),
            a('PDF rendering still happens inside the API pods. Moving it to the worker queue is not started; I will plan it after the upgrade notes.'),
            ...chat('orchard', 6, 13),
        ],
        close: [{ k: 'wh', why: ['done'], evidence: 'The contract tests for the payment webhooks are added' }],
        claims: [
            { k: 'wh', span: 'Contract tests for the payment webhooks: added, 18 cases' },
            { k: 'pdf', span: 'PDF rendering: moved to the worker queue' },
            { k: 'cur', span: 'the operator decided that they expire after 24 hours' },
        ],
        note: 'The summary is an agent turn in the middle of the tail. One of its three claims is also stated by a real turn before it; one is contradicted after it; one (an operator decision) appears nowhere else.',
    },
    {
        id: 'rec-23-compaction-accurate-quiet', plants: ['compaction', 'easy'], size: 'medium', project: 'brasswork', now: '2026-10-31T10:22:00Z',
        facts: [
            ...bg('brasswork', 'goal', 'b1'),
            f('win', 'next', 'Fix the failing path tests on Windows'),
            ...bg('brasswork', 'b3', 'b5'),
            f('man', 'next', 'Document the prune command in the manual page'),
            ...bg('brasswork', 'b7', 'b9'),
        ],
        tail: [
            sumU(`${CONTINUED}1. The goal is release 0.9.0 with the prune command and Windows support.\n2. The prune command exists with age and count limits.\n3. Still open: the failing path tests on Windows, and the manual page for prune.\n4. The operator asked for clippy to stay clean.`),
            a('Continuing. clippy first, as asked.'),
            ...chat('brasswork', 0, 2),
        ],
        note: 'Plain case: the summary is accurate and says the open facts are still open; the real turns are about other things. No operation is expected.',
    },
    {
        id: 'rec-24-compaction-long-summary', plants: ['compaction', 'stale'], size: 'large', project: 'tidewater', now: '2026-11-03T21:40:00Z',
        facts: [
            ...between(all('tidewater'), {
                5: f('pq', 'decisions', 'Write the exports as Parquet files', { why: 'the analysts read them straight into their notebooks' }),
                12: f('resend', 'next', 'Stop the loader from resending a batch after a timeout'),
                19: f('alert', 'next', 'Add an alert when a nightly load takes longer than 40 minutes'),
            }),
        ],
        tail: [
            sumU(`${CONTINUED}1. Primary request: make the orders pipeline load a full day in under 20 minutes without duplicate rows.\n2. Key decisions so far: deduplicate on order_id plus line_no; keep raw extracts for 14 days; run the nightly load at 02:30 UTC. The exports were switched from Parquet to CSV.\n3. Work completed: the extract uses the updated_at watermark; the loader writes batches of 5,000 rows; every warehouse table has a load_id column; the connection pool went from 4 to 12 connections; order timestamps are stored in UTC.\n4. Files and code sections: pipeline/extract.py (watermark query), pipeline/load.py (batching, the resend after a timeout near line 88), pipeline/transform.py (line item parser), checks/row_counts.sql (staging against warehouse), docs/runbooks/nightly-load.md (what to do when a nightly load fails), ddl/staging (three files, columns sorted), tests/test_line_items.py (38 cases), utils/dates.py (type errors fixed).\n5. Errors met and how they were handled: a deprecation warning in the transform step (the option was removed); three type errors in the date helpers (fixed without behaviour change); a slow pre-commit hook (explained, not changed).\n6. Pending: document the load_id column in the data dictionary.\n7. Monitoring: the alert for nightly loads longer than 40 minutes is in place.\n8. Current work: none in flight; waiting for the next instruction.`),
            a('Continuing after the summary. Nothing is in flight, so I wait for your next instruction.'),
            ...chat('tidewater', 0, 9, 2, 3),
            u('Fix the resend in the loader now.'),
            ed('pipeline/load.py'),
            sh('pytest tests/test_load_retry.py -q', '7 passed in 0.48s'),
            a('The loader no longer resends a batch after a timeout: it first asks the warehouse whether the load_id of that batch was already written and only sends it again when it was not. Seven tests cover the timeout cases.'),
            ...chat('tidewater', 5, 10, 6, 12, 7),
        ],
        close: [{ k: 'resend', why: ['done'], evidence: 'The loader no longer resends a batch after a timeout' }],
        claims: [
            { k: 'pq', span: 'The exports were switched from Parquet to CSV' },
            { k: 'alert', span: 'the alert for nightly loads longer than 40 minutes is in place' },
        ],
        note: 'A long summary (clipped in the middle by the plugin) claims a decision was replaced and an alert exists; no real turn says either. One other fact is finished in a real turn after the summary.',
    },
];
