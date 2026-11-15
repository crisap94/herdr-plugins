import type { HistoryFact } from '../../../tab-recap/src/ports/ledger.ts';

export interface BankFact {
    id: string;
    project: string;
    section: string;
    text: string;
    keys: string[];
    para: string;
    why: string | null;
    whyKeys: string[];
    reason: string | null;
    vague: string | null;
    wrong: string | null;
}

interface Extra { why?: string; whyKeys?: string[]; reason?: string; vague?: string; wrong?: string }

const LETTER: Record<string, string> = { goal: 'g', now: 'w', needs: 'n', decisions: 'd', rules: 'r', next: 'x' };

function project(name: string, prefix: string, rows: [string, string, string[], string, Extra?][]): BankFact[] {
    const seen: Record<string, number> = {};
    return rows.map(([section, text, keys, para, extra]) => {
        const letter = LETTER[section]!;
        seen[letter] = (seen[letter] ?? 0) + 1;
        const single = section === 'goal' || section === 'now';
        return { id: `${prefix}.${letter}${single ? '' : seen[letter]}`, project: name, section, text, keys, para, why: extra?.why ?? null, whyKeys: extra?.whyKeys ?? [], reason: extra?.reason ?? null, vague: extra?.vague ?? null, wrong: extra?.wrong ?? null };
    });
}

export const INTRO: Record<string, string> = {
    'orchard-api': 'This session works on the refund path of the orchard-api service.',
    'quarry-etl': 'This session works on the nightly load of the quarry-etl pipeline.',
    'lantern-ui': 'This session works on the lantern-ui component library.',
    'kestrel-sync': 'This session works on the upload path of the kestrel-sync daemon.',
    'tidewater-infra': 'This session works on the tidewater staging cluster.',
    'marrow-firmware': 'This session works on the power budget of the marrow sensor firmware.',
};

const orchard = project('orchard-api', 'o', [
    ['goal', 'Ship idempotent refunds on POST /v2/refunds before the 0.19.0 release of orchard-api', ['0.19.0'], 'The work is to get refunds on POST /v2/refunds idempotent in time for orchard-api 0.19.0.'],
    ['now', 'Rewriting the dedupe lookup in internal/refund/dedupe.go to use the idem_keys table', ['internal/refund/dedupe.go'], 'In progress: internal/refund/dedupe.go is being rewritten so that its lookup reads the idem_keys table.'],
    ['needs', 'The refund handler returns 500 when the ledger call takes longer than 800 ms', ['800 ms'], 'A ledger call slower than 800 ms still makes the refund handler answer 500.', { vague: 'The refund handler still fails when the ledger is slow.', wrong: 'A ledger call slower than 300 ms still makes the refund handler answer 500.' }],
    ['needs', 'Migration 0042_idem_keys.sql has not been applied on the staging database', ['0042_idem_keys.sql'], 'The staging database is still without migration 0042_idem_keys.sql.', { vague: 'A migration is still pending somewhere.' }],
    ['needs', 'TestRefundReplay fails 1 run in 6 with a duplicate ledger entry', ['TestRefundReplay', '1 run in 6'], 'TestRefundReplay is flaky, about 1 run in 6, each time on a duplicate ledger entry.', { wrong: 'TestRefundReplay is flaky, about 1 run in 20, each time on a duplicate ledger entry.' }],
    ['needs', 'The operator must say whether partial refunds above 250 EUR need a second approval', ['250 EUR'], 'Waiting on the operator: do partial refunds over 250 EUR require a second approval?', { vague: 'The operator still owes an answer about refund approvals.' }],
    ['needs', 'The webhook signer still reads the retired secret ORCHARD_HOOK_KEY_V1', ['ORCHARD_HOOK_KEY_V1'], 'ORCHARD_HOOK_KEY_V1, a retired secret, is still what the webhook signer reads.'],
    ['needs', 'p99 latency of GET /v2/disputes/{id} rose from 40 ms to 310 ms after the join was added', ['/v2/disputes/{id}', '310 ms'], 'Since the join went in, GET /v2/disputes/{id} has a p99 of 310 ms, up from 40 ms.', { wrong: 'Since the join went in, GET /v2/disputes/{id} has a p99 of 130 ms, up from 40 ms.' }],
    ['needs', 'The OpenAPI file api/openapi.yaml lacks the Idempotency-Key header on three endpoints', ['api/openapi.yaml'], 'Three endpoints in api/openapi.yaml are missing the Idempotency-Key header.'],
    ['needs', 'Sandbox bank gateway.bank.test rejects refunds with currency CHF', ['gateway.bank.test', 'CHF'], 'Refunds in CHF are turned down by the sandbox bank at gateway.bank.test.'],
    ['needs', 'The retry queue holds 1,240 refunds stuck in state pending_ledger', ['1,240'], '1,240 refunds sit in the retry queue, stuck in pending_ledger.', { wrong: 'About 120 refunds sit in the retry queue, stuck in pending_ledger.' }],
    ['needs', 'cmd/reconcile panics on a nil Settlement when the batch is empty', ['cmd/reconcile'], 'An empty batch makes cmd/reconcile panic on a nil Settlement.', { vague: 'The reconcile command has a crash to fix.' }],
    ['needs', 'The audit log drops the actor field for refunds created by the admin console', ['actor field'], 'For refunds made from the admin console the actor field never reaches the audit log.'],
    ['needs', 'Rate limit for refunds is still 5 per minute per merchant in config/limits.toml', ['config/limits.toml', '5 per minute'], 'config/limits.toml still caps refunds at 5 per minute per merchant.'],
    ['needs', 'The mock ledger in testdata/ledger_stub.json has no entry for merchant m_7731', ['testdata/ledger_stub.json', 'm_7731'], 'Merchant m_7731 is absent from the mock ledger, testdata/ledger_stub.json.'],
    ['needs', 'Dashboard panel refund-lag reads the wrong metric, refund_total instead of refund_lag_seconds', ['refund_lag_seconds'], 'The refund-lag dashboard panel is wired to refund_total when it should read refund_lag_seconds.'],
    ['decisions', 'Idempotency keys are stored for 72 hours', ['72 hours'], 'It was decided to store idempotency keys for 72 hours.', { why: "the bank's own replay window is 48 hours and a day of margin was wanted", whyKeys: ['48 hours'], reason: 'That window was chosen as the bank replays for up to 48 hours, plus one day of margin.' }],
    ['decisions', 'Use a unique index on (merchant_id, idem_key) instead of an advisory lock', ['(merchant_id, idem_key)'], 'Deduplication relies on a unique index over (merchant_id, idem_key), not on an advisory lock.', { why: 'advisory locks were lost when pgbouncer ran in transaction mode', whyKeys: ['pgbouncer'], reason: 'Advisory locks had been getting lost under pgbouncer in transaction mode.' }],
    ['decisions', 'A replayed refund returns the original 201 body, not a 409', ['201 body'], 'Replaying a refund gives back the original 201 body and never a 409.', { why: 'two merchant SDKs treat 409 as a hard failure and stop retrying', whyKeys: ['merchant SDKs'], reason: 'The cause is that two merchant SDKs take a 409 as fatal and give up retrying.' }],
    ['decisions', 'Refund amounts are kept as integer minor units in column amount_minor', ['amount_minor'], 'Amounts for refunds live in the amount_minor column as whole minor units.', { why: 'float rounding lost one cent on 3 of 10,000 test refunds', whyKeys: ['10,000'], reason: 'Floats had rounded a cent away on 3 of 10,000 test refunds.' }],
    ['decisions', 'The ledger client times out at 2 seconds and retries twice', ['2 seconds'], 'Calls to the ledger give up at 2 seconds and are retried twice.', { why: "the ledger's p99 is 1.1 seconds and a third retry doubled queue depth", whyKeys: ['1.1 seconds'], reason: 'This follows from a ledger p99 of 1.1 seconds and from a third retry having doubled the queue depth.' }],
    ['decisions', 'Partial refunds are rejected when the charge is older than 180 days', ['180 days'], 'A partial refund on a charge older than 180 days is refused.', { why: 'the card scheme refuses them after that and the error came back two days late', whyKeys: ['card scheme'], reason: 'The card scheme turns those down anyway and its error used to arrive two days late.' }],
    ['decisions', 'Webhook refund.settled is sent only after the ledger confirms', ['refund.settled'], 'refund.settled goes out only once the ledger has confirmed.', { why: 'merchants shipped goods back on an early webhook that was later reversed', whyKeys: ['shipped goods'], reason: 'Merchants had shipped goods back on an early webhook that then got reversed.' }],
    ['decisions', 'The feature ships behind flag refunds_v2_idem, off by default', ['refunds_v2_idem'], 'Everything sits behind the refunds_v2_idem flag, which defaults to off.', { why: 'the operator wants one merchant on it for a week before everyone', whyKeys: ['one merchant'], reason: 'The operator asked for one merchant to run it for a week ahead of the rest.' }],
    ['rules', 'Never run migrations against production from this session', ['against production'], 'Migrations must never be run against production from this session.'],
    ['rules', 'Every commit message starts with the ticket id, like ORCH-412', ['ORCH-412'], 'Commit messages begin with the ticket id, for example ORCH-412.'],
    ['rules', 'Run make lint-go before every push', ['make lint-go'], 'make lint-go has to pass ahead of each push.', { vague: 'Some checking is expected before pushing.' }],
    ['rules', 'Do not edit generated files under gen/proto/', ['gen/proto/'], 'Files generated under gen/proto/ are not to be edited by hand.'],
    ['rules', 'Answers to the operator are written in plain English, at most 120 words', ['120 words'], 'Replies to the operator stay in plain English and within 120 words.', { wrong: 'Replies to the operator stay in plain English and within 300 words.' }],
    ['next', 'Add an index on refunds(created_at) for the export job', ['refunds(created_at)'], 'Later: the export job wants an index on refunds(created_at).'],
    ['next', 'Write the runbook page docs/runbooks/refund-replay.md', ['docs/runbooks/refund-replay.md'], 'The runbook page docs/runbooks/refund-replay.md remains to be written.'],
    ['next', 'Remove the deprecated endpoint POST /v1/refund after 0.20.0', ['/v1/refund', '0.20.0'], 'Once 0.20.0 is out, the deprecated POST /v1/refund can be removed.'],
    ['next', 'Load-test at 400 requests per second with scripts/k6/refund.js', ['scripts/k6/refund.js', '400 requests per second'], 'A load test with scripts/k6/refund.js at 400 requests per second is still to do.'],
    ['next', 'Ask the bank contact for a sandbox account that settles in NOK', ['NOK'], 'Someone should ask the bank contact for a sandbox account settling in NOK.'],
    ['next', 'Backfill idem_key for the 18,300 refunds created before October', ['18,300'], 'The 18,300 refunds from before October need their idem_key backfilled.'],
    ['next', 'Add a Grafana alert when pending_ledger exceeds 500', ['exceeds 500'], 'A Grafana alert is wanted for when pending_ledger exceeds 500.'],
    ['next', 'Rename package internal/refund/v2 to internal/refunds', ['internal/refund/v2'], 'internal/refund/v2 should be renamed to internal/refunds at some point.'],
    ['next', 'Document the Idempotency-Key header in the merchant guide at docs.orchard.test/refunds', ['docs.orchard.test/refunds'], 'The merchant guide at docs.orchard.test/refunds still has to describe the Idempotency-Key header.'],
    ['next', 'Delete the feature flag refunds_legacy_path once traffic is zero for 14 days', ['refunds_legacy_path', '14 days'], 'When traffic has been zero for 14 days, the refunds_legacy_path flag can go.'],
    ['next', "Add a contract test for the bank's error code E-2207", ['E-2207'], "The bank's error code E-2207 deserves a contract test."],
    ['next', 'Move the cron for reconcile from 02:00 to 04:30 UTC', ['04:30 UTC'], 'The reconcile cron should move from 02:00 to 04:30 UTC.'],
    ['next', 'Open ticket ORCH-431 for the admin console to show the idempotency key', ['ORCH-431'], 'ORCH-431 should be opened so that the admin console displays the idempotency key.'],
    ['next', 'Benchmark the dedupe lookup with 2 million rows in idem_keys', ['2 million rows'], 'The dedupe lookup still needs a benchmark against 2 million rows in idem_keys.'],
    ['next', 'Review the retry budget with the ledger team on Thursday', ['Thursday'], 'On Thursday the retry budget gets reviewed with the ledger team.'],
]);

const quarry = project('quarry-etl', 'q', [
    ['goal', 'Cut the nightly meter-readings load of quarry-etl from 3 h 10 min to under 45 minutes', ['3 h 10 min', '45 minutes'], 'Aim: the nightly meter-readings load in quarry-etl, 3 h 10 min today, should finish in under 45 minutes.'],
    ['now', 'Profiling the dedupe step in jobs/readings/dedupe.py on the 2026-10 partition', ['jobs/readings/dedupe.py'], 'Right now the dedupe step, jobs/readings/dedupe.py, is being profiled on the 2026-10 partition.'],
    ['needs', 'The dedupe step holds all 96 million rows in memory and swaps at 61 GB', ['96 million', '61 GB'], 'Dedupe loads all 96 million rows at once and starts swapping at 61 GB.', { vague: 'The dedupe step uses too much memory.', wrong: 'Dedupe loads all 96 million rows at once and starts swapping at 16 GB.' }],
    ['needs', 'Partition 2026-09-14 is missing 4,112 readings from site DK-07', ['2026-09-14', '4,112', 'DK-07'], 'Site DK-07 lacks 4,112 readings in partition 2026-09-14.', { vague: 'One partition has a gap in its readings.' }],
    ['needs', 'The schema check in checks/schema.py passes a null meter_id', ['checks/schema.py'], 'A null meter_id gets through the schema check, checks/schema.py.'],
    ['needs', 'The operator has to choose between a 7-day and a 30-day reprocessing window', ['7-day', '30-day'], 'Open for the operator: reprocess over a 7-day window or a 30-day one.'],
    ['needs', 'Task load_readings retries 5 times with no backoff and floods the warehouse', ['5 times'], 'load_readings retries 5 times without any backoff, which floods the warehouse.', { wrong: 'load_readings retries 2 times without any backoff, which floods the warehouse.' }],
    ['needs', 'Timestamps from vendor feed feeds.vendor.test/v3 arrive in local time without an offset', ['feeds.vendor.test/v3'], 'The vendor feed feeds.vendor.test/v3 sends local-time timestamps with no offset.'],
    ['needs', 'The row count check tolerates a 10 % drop, which hid the September gap', ['10 % drop'], 'A 10 % drop is tolerated by the row count check, and that is how the September gap went unseen.'],
    ['needs', 'Unit tests under tests/readings/ take 14 minutes because each builds its own Spark session', ['tests/readings/', '14 minutes'], 'tests/readings/ needs 14 minutes to run, since every test starts a Spark session of its own.'],
    ['needs', 'The staging bucket s3://quarry-stage/readings/ has no lifecycle rule and holds 2.3 TB', ['s3://quarry-stage/readings/', '2.3 TB'], 'With no lifecycle rule, s3://quarry-stage/readings/ has grown to 2.3 TB.'],
    ['decisions', 'Dedupe runs per site partition instead of over the whole day', ['per site partition'], 'Deduplication now happens per site partition, no longer across the full day.', { why: 'a single site never exceeds 3 million rows, which fits in memory', whyKeys: ['3 million'], reason: 'No single site goes past 3 million rows, so it fits in memory.' }],
    ['decisions', 'Readings are written as Parquet with zstd level 3', ['zstd level 3'], 'Output is Parquet compressed with zstd level 3.', { why: 'level 9 saved 4 % more space but doubled write time', whyKeys: ['level 9'], reason: 'Going to level 9 only saved 4 % more space while doubling the write time.' }],
    ['decisions', 'The duplicate key is (meter_id, read_at, source)', ['(meter_id, read_at, source)'], 'Duplicates are identified by (meter_id, read_at, source).', { why: 'two vendors report the same meter and both rows are wanted', whyKeys: ['two vendors'], reason: 'The same meter is reported by two vendors and both of their rows must stay.' }],
    ['decisions', 'Late readings are accepted up to 5 days after the read date', ['5 days'], 'A reading may arrive late, up to 5 days after its read date, and still be accepted.', { why: 'the slowest vendor delivers corrections on day 4', whyKeys: ['day 4'], reason: 'Corrections from the slowest vendor come in on day 4.' }],
    ['decisions', 'The load uses COPY from staged files, not row inserts', ['COPY from staged files'], 'Loading goes through COPY from staged files and not through row inserts.', { why: 'row inserts alone took 2 h 20 min of the nightly run', whyKeys: ['2 h 20 min'], reason: 'Row inserts by themselves ate 2 h 20 min of each nightly run.' }],
    ['decisions', 'Airflow pool readings_pool is capped at 8 slots', ['readings_pool', '8 slots'], 'readings_pool, the Airflow pool, is limited to 8 slots.', { why: '12 slots starved the billing export that shares the warehouse', whyKeys: ['12 slots'], reason: 'At 12 slots the billing export on the same warehouse was starved.' }],
    ['decisions', 'Null meter_id rows go to table quarantine.readings_bad, they are not dropped', ['quarantine.readings_bad'], 'Rows whose meter_id is null are kept in quarantine.readings_bad and never dropped.', { why: 'the vendor is billed per bad row and needs the evidence', whyKeys: ['billed per bad row'], reason: 'The vendor gets billed per bad row, which takes evidence.' }],
    ['rules', 'Never write to the production warehouse schema prod_readings from a dev run', ['prod_readings'], 'A dev run must never write into prod_readings, the production warehouse schema.'],
    ['rules', 'All dates in file names are UTC and formatted YYYY-MM-DD', ['YYYY-MM-DD'], 'File names carry UTC dates in the YYYY-MM-DD format.'],
    ['rules', 'Run pytest -m fast before proposing a change', ['pytest -m fast'], 'Before any change is proposed, pytest -m fast must have run.', { vague: 'Some testing is expected before changes are proposed.' }],
    ['next', "Backfill the gap from the vendor's resend file resend_0914.csv.gz", ['resend_0914.csv.gz'], "When it arrives, the vendor's resend file resend_0914.csv.gz is to be backfilled."],
    ['next', 'Add a lifecycle rule of 21 days to the staging bucket', ['21 days'], 'The staging bucket should get a lifecycle rule of 21 days.'],
    ['next', 'Share one Spark session across the test module with a session-scoped fixture', ['session-scoped fixture'], 'A session-scoped fixture could give the whole test module one shared Spark session.'],
    ['next', 'Lower the row count tolerance to 0.5 %', ['0.5 %'], 'The tolerance of the row count check should come down to 0.5 %.'],
    ['next', 'Add exponential backoff starting at 30 seconds to load_readings', ['30 seconds'], 'load_readings should back off exponentially, starting at 30 seconds.'],
    ['next', 'Publish the run time to the dashboard at grafana.quarry.test/d/nightly', ['grafana.quarry.test/d/nightly'], 'Run time is to be published on grafana.quarry.test/d/nightly.'],
    ['next', 'Write ADR 0017 about per-site dedupe', ['ADR 0017'], 'ADR 0017, on per-site dedupe, still has to be written.'],
    ['next', 'Ask the vendor to send offsets in ISO 8601', ['ISO 8601'], 'The vendor should be asked for ISO 8601 offsets.'],
    ['next', 'Drop the unused column raw_payload after two clean weeks', ['raw_payload'], 'After two clean weeks the unused raw_payload column can be dropped.'],
]);

const lantern = project('lantern-ui', 'l', [
    ['goal', 'Migrate the lantern-ui Button, Menu and Dialog components to the new token set tokens-3', ['tokens-3'], "Goal: move lantern-ui's Button, Menu and Dialog over to the tokens-3 token set."],
    ['now', 'Converting packages/dialog/src/Dialog.tsx to CSS variables', ['packages/dialog/src/Dialog.tsx'], 'Currently packages/dialog/src/Dialog.tsx is being converted to CSS variables.'],
    ['needs', 'Dialog loses its focus trap when opened from a Menu item in Safari 19', ['Safari 19'], 'In Safari 19, a Dialog opened from a Menu item has no working focus trap.', { vague: 'There is a focus bug in one browser.', wrong: 'In Firefox 140, a Dialog opened from a Menu item has no working focus trap.' }],
    ['needs', 'Visual regression shows 23 changed snapshots in the Button stories', ['23 changed snapshots'], 'The Button stories have 23 changed snapshots in visual regression.', { wrong: 'The Button stories have 41 changed snapshots in visual regression.' }],
    ['needs', 'The operator must approve the new focus ring colour, #1f6feb at 2px', ['#1f6feb'], "Awaiting the operator's approval of the new focus ring: #1f6feb, 2px wide.", { vague: 'A colour choice awaits the operator.' }],
    ['decisions', 'Tokens are exposed as CSS variables with the prefix --ln-', ['--ln-'], 'Each token becomes a CSS variable prefixed --ln-.', { why: 'the docs site and the app load two versions side by side during the migration', whyKeys: ['two versions side by side'], reason: 'During the migration the app and the docs site run two versions side by side.' }],
    ['decisions', 'Menu keeps its own z-index scale, starting at 1200', ['1200'], 'The Menu retains a z-index scale of its own that begins at 1200.', { why: "the host app's sticky header sits at 1100 and covered the menu", whyKeys: ['1100'], reason: 'The sticky header of the host app is at 1100 and used to cover the menu.' }],
    ['decisions', 'Dark mode is selected by the attribute data-ln-theme, not by a class', ['data-ln-theme'], 'Dark mode is switched through the data-ln-theme attribute and not through a class.', { why: 'the host app strips unknown classes from the html element', whyKeys: ['strips unknown classes'], reason: 'The host app strips unknown classes off the html element.' }],
    ['rules', 'Every component change needs a story and a snapshot in the same commit', ['a story and a snapshot'], 'A component change always ships with a story and a snapshot, in one commit.', { vague: 'Component changes follow the usual habit.' }],
    ['rules', 'Do not bump the major version; this release stays 4.x', ['4.x'], 'No major bump: the release remains on 4.x.'],
    ['next', 'Remove the Sass mixins in packages/core/scss/_legacy.scss', ['packages/core/scss/_legacy.scss'], 'The Sass mixins of packages/core/scss/_legacy.scss are to be removed later.'],
    ['next', 'Publish a codemod named ln-migrate-vars for downstream apps', ['ln-migrate-vars'], 'Downstream apps should get a codemod, ln-migrate-vars.'],
]);

const kestrel = project('kestrel-sync', 'k', [
    ['goal', 'Make kestrel-sync resume an interrupted upload instead of restarting it from byte 0', ['byte 0'], 'The objective is for kestrel-sync to resume interrupted uploads, not start again at byte 0.'],
    ['now', 'Adding a chunk journal in crates/transfer/src/journal.rs', ['crates/transfer/src/journal.rs'], 'Under way: a chunk journal, in crates/transfer/src/journal.rs.'],
    ['needs', 'Resume fails with error E_CHUNK_GAP when the server lost the last 2 chunks', ['E_CHUNK_GAP'], 'If the server has lost the last 2 chunks, resuming dies with E_CHUNK_GAP.', { vague: 'Resuming still fails in one case.' }],
    ['needs', 'The integration test resume_after_kill hangs on macOS runners after 90 seconds', ['resume_after_kill', '90 seconds'], 'On macOS runners the resume_after_kill integration test hangs once 90 seconds have passed.', { wrong: 'On macOS runners the resume_after_kill integration test hangs once 15 seconds have passed.' }],
    ['needs', 'The operator must confirm that 8 MiB chunks are acceptable on metered links', ['8 MiB'], 'Still to be confirmed by the operator: are 8 MiB chunks fine on metered links?'],
    ['decisions', 'The journal is an append-only file, fsynced every 16 chunks', ['every 16 chunks'], 'The journal is append-only and gets fsynced every 16 chunks.', { why: 'fsync on every chunk cut throughput by 38 %', whyKeys: ['38 %'], reason: 'Syncing after each chunk had cost 38 % of throughput.' }],
    ['decisions', 'Chunks are hashed with BLAKE3, not SHA-256', ['BLAKE3'], 'BLAKE3 replaces SHA-256 for chunk hashes.', { why: 'hashing was 22 % of CPU time on the ARM boxes', whyKeys: ['ARM boxes'], reason: 'On the ARM boxes hashing took 22 % of CPU time.' }],
    ['decisions', 'A resume older than 7 days starts over', ['older than 7 days'], 'Any resume older than 7 days is abandoned and the upload starts over.', { why: 'the server garbage-collects partial uploads after a week', whyKeys: ['garbage-collects'], reason: 'The server garbage-collects partial uploads after one week.' }],
    ['rules', 'No unwrap() in crates/transfer; return TransferError', ['TransferError'], 'crates/transfer must not use unwrap(); errors are returned as TransferError.'],
    ['rules', 'Run cargo nextest run -p transfer before reporting done', ['cargo nextest run -p transfer'], 'Done may only be reported once cargo nextest run -p transfer has run.', { vague: 'Tests come before saying done.' }],
    ['next', 'Expose resume progress in the status socket at /run/kestrel/status.sock', ['/run/kestrel/status.sock'], 'Resume progress should show up on the status socket, /run/kestrel/status.sock.'],
    ['next', 'Write the migration note for journal format version 2', ['format version 2'], 'A migration note for journal format version 2 is still owed.'],
]);

const tidewater = project('tidewater-infra', 't', [
    ['goal', 'Move the tidewater staging cluster from node pool np-old-a to np-arm-b with no downtime', ['np-arm-b'], 'Target: staging in tidewater leaves node pool np-old-a for np-arm-b with zero downtime.'],
    ['now', 'Draining node stg-a-07 and watching the ingress error rate', ['stg-a-07'], 'At the moment node stg-a-07 is draining while the ingress error rate is watched.'],
    ['needs', 'Deployment search-indexer has no arm64 image and stays Pending', ['search-indexer'], 'search-indexer ships no arm64 image, so its Deployment sits in Pending.', { vague: 'One workload is not ready for the new nodes.' }],
    ['needs', 'PodDisruptionBudget for api-gateway allows 0 disruptions and blocks the drain', ['api-gateway'], "The drain is blocked: api-gateway's PodDisruptionBudget permits 0 disruptions."],
    ['needs', 'The operator must decide whether to raise the quota from 48 to 64 vCPU', ['64 vCPU'], 'Pending with the operator: lift the quota from 48 to 64 vCPU or not.', { wrong: 'Pending with the operator: lift the quota from 48 to 96 vCPU or not.' }],
    ['decisions', 'Nodes are drained one at a time with a 10-minute pause', ['10-minute pause'], 'Draining goes node by node, with a 10-minute pause in between.', { why: 'draining two at once dropped 3 % of requests on the first try', whyKeys: ['3 % of requests'], reason: 'The first attempt, two nodes together, lost 3 % of requests.' }],
    ['decisions', 'Terraform state stays in the bucket tidewater-tfstate-stg, one workspace per cluster', ['tidewater-tfstate-stg'], 'State remains in tidewater-tfstate-stg with a workspace for each cluster.', { why: 'a shared workspace let a plan for prod touch staging last month', whyKeys: ['plan for prod'], reason: 'Last month, under a shared workspace, a plan for prod reached into staging.' }],
    ['decisions', 'The new pool uses spot instances for at most half of its nodes', ['half of its nodes'], 'In the new pool, spot instances may make up no more than half of its nodes.', { why: 'a spot reclaim took out 9 of 12 nodes in the test cluster', whyKeys: ['9 of 12'], reason: 'In the test cluster one spot reclaim removed 9 of 12 nodes.' }],
    ['rules', 'Never run terraform apply without a saved plan file', ['saved plan file'], 'terraform apply is only ever run from a saved plan file.'],
    ['rules', "Changes to DNS zone stg.tidewater.test need the operator's yes first", ['stg.tidewater.test'], 'Nothing in the DNS zone stg.tidewater.test changes before the operator says yes.', { vague: 'Some changes need sign-off.' }],
    ['next', 'Delete np-old-a after 3 quiet days', ['3 quiet days'], 'np-old-a gets deleted following 3 quiet days.'],
    ['next', 'Update the capacity sheet at wiki.tidewater.test/capacity', ['wiki.tidewater.test/capacity'], 'The capacity sheet, wiki.tidewater.test/capacity, needs updating.'],
]);

const marrow = project('marrow-firmware', 'm', [
    ['goal', 'Get the marrow sensor board to sleep below 12 µA between LoRa transmissions', ['12 µA'], 'Purpose: between LoRa transmissions the marrow sensor board should draw under 12 µA asleep.'],
    ['now', 'Measuring current on rail VDD_RF with the radio in standby', ['VDD_RF'], 'Being measured now: current on the VDD_RF rail while the radio is in standby.'],
    ['needs', 'The board draws 84 µA in sleep because the accelerometer stays in normal mode', ['84 µA'], 'Sleep current is 84 µA, the accelerometer being left in normal mode.', { vague: 'Sleep current is still too high.', wrong: 'Sleep current is 48 µA, the accelerometer being left in normal mode.' }],
    ['needs', 'Wake-up from STOP2 takes 31 ms and misses the first RX window', ['31 ms'], 'Coming out of STOP2 costs 31 ms, enough to miss the first RX window.'],
    ['needs', 'The operator must choose between a 15-minute and a 60-minute reporting interval', ['15-minute', '60-minute'], 'The operator has yet to pick the reporting interval: 15-minute or 60-minute.'],
    ['decisions', 'The RTC runs from the LSE crystal, not the LSI oscillator', ['LSE crystal'], 'Timekeeping uses the LSE crystal for the RTC instead of the LSI oscillator.', { why: 'LSI drifted 4 seconds per hour at minus 10 degrees', whyKeys: ['4 seconds per hour'], reason: 'At minus 10 degrees the LSI was off by 4 seconds per hour.' }],
    ['decisions', 'GPIO pins PB3 to PB7 are set to analog mode before sleep', ['PB3 to PB7'], 'Before sleeping, PB3 to PB7 are switched to analog mode.', { why: 'floating inputs leaked about 20 µA', whyKeys: ['20 µA'], reason: 'Left floating, those inputs leaked roughly 20 µA.' }],
    ['decisions', 'The firmware keeps the bootloader at 0x08000000 and the app at 0x08008000', ['0x08008000'], 'Layout: bootloader at 0x08000000, application at 0x08008000.', { why: 'the field update tool flashes only above the first 32 KiB', whyKeys: ['32 KiB'], reason: 'Only addresses above the first 32 KiB are flashed by the field update tool.' }],
    ['rules', 'Never flash a board without reading its serial from OTP first', ['serial from OTP'], 'Read the serial from OTP before flashing any board, always.'],
    ['rules', 'Power numbers are reported as the mean of 5 runs of 60 seconds', ['5 runs'], 'A power figure is the mean over 5 runs lasting 60 seconds each.', { wrong: 'A power figure is a single run lasting 60 seconds.' }],
    ['next', "Try the regulator's low-power mode via register 0x2C", ['0x2C'], "Register 0x2C, the regulator's low-power mode, is worth a try."],
    ['next', 'Log sleep current to tools/bench/sleep_log.csv on every build', ['tools/bench/sleep_log.csv'], 'Each build should log sleep current into tools/bench/sleep_log.csv.'],
]);

export const BANK: BankFact[] = [...orchard, ...quarry, ...lantern, ...kestrel, ...tidewater, ...marrow];

export const SETTLED: Record<string, [string, string, HistoryFact['closedWhy'], string | null][]> = {
    'orchard-api': [
        ['needs', 'The staging deploy of 0.18.4 was stuck on a failed health check', 'done', null],
        ['next', 'Try an advisory lock for deduplication', 'superseded', null],
        ['decisions', 'Dedupe keys live in Redis with a one-day expiry', 'superseded', 'it was the fastest thing to try first'],
        ['needs', 'The operator had to name the merchant for the pilot', 'answered', null],
        ['now', 'Reading the bank sandbox documentation for replay rules', 'done', null],
        ['done', 'Added the idem_keys table and its migration', null, null],
        ['done', 'Wrote the first replay test against the sandbox bank', null, null],
        ['links', 'https://git.orchard.test/api/-/merge_requests/618', null, null],
    ],
    'kestrel-sync': [
        ['needs', 'The chunk size constant was duplicated in two crates', 'done', null],
        ['next', 'Sketch the journal record layout', 'done', null],
        ['done', 'Split the upload loop out of the session module', null, null],
        ['links', 'https://ci.kestrel.test/pipelines/9041', null, null],
    ],
    'quarry-etl': [
        ['needs', 'The profiler could not attach to the Spark driver', 'done', null],
        ['decisions', 'Dedupe over the whole day with a bigger executor', 'superseded', 'it needed no code change'],
        ['done', 'Measured each step of the nightly run', null, null],
        ['links', 'https://airflow.quarry.test/dags/nightly_readings', null, null],
    ],
};
