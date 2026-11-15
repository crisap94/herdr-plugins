import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { curatorInput } from '../../tab-recap/src/recap/application/curator-input.ts';
import { localTime } from '../../tab-recap/src/recap/application/local-time.ts';
import type { ClosedWhy, Fact, FactId, Section } from '../../tab-recap/src/recap/domain/fact.ts';
import { checkedTokens } from './tokens.ts';

const NOW = Date.parse('2026-11-10T16:30:00Z');
const ZONE = 'UTC';
const MINUTE = 60_000;

interface Draft {
    readonly k: string;
    readonly s: Section;
    readonly at: number;
    readonly t: string;
    readonly why?: string;
    readonly ref?: string;
    readonly closed?: readonly [ClosedWhy, number];
}

interface Project {
    readonly host: string;
    readonly unit: string;
    readonly path: (name: string) => string;
    readonly parts: readonly string[];
}

interface Plan {
    readonly id: string;
    readonly project: keyof typeof PROJECTS;
    readonly name: string;
    readonly language: 'en' | 'es';
    readonly plants: readonly string[];
    readonly size: 'small' | 'medium' | 'large';
    readonly span: number;
    readonly total: number;
    readonly core: readonly Draft[];
    readonly copies?: readonly { readonly of: string; readonly k: string; readonly at: number }[];
    readonly reworded?: readonly { readonly weak: string; readonly keep: string }[];
    readonly near?: readonly (readonly [string, string])[];
    readonly waiting?: { readonly keys: readonly string[]; readonly gist: string };
    readonly closed?: readonly { readonly k: string; readonly must_not_say: string; readonly current: string | null }[];
}

const PROJECTS = {
    orchard: { host: 'orchard', unit: 'module', path: (name: string) => `src/${name}/index.ts`, parts: ['invoices', 'refunds', 'carts', 'coupons', 'shipments', 'inventory', 'pricing', 'taxes', 'webhooks', 'sessions', 'addresses', 'returns', 'ledgers', 'payouts', 'catalog', 'reviews', 'wishlists', 'bundles', 'subscriptions', 'notifications'] },
    lantern: { host: 'lantern', unit: 'component', path: (name: string) => `src/${name}/index.tsx`, parts: ['sidebar', 'toolbar', 'datepicker', 'chart-legend', 'table-pager', 'filter-bar', 'toast', 'modal', 'breadcrumb', 'avatar-menu', 'search-box', 'tag-input', 'tooltip', 'tabs', 'stepper', 'dropzone', 'color-swatch', 'empty-state', 'skeleton', 'badge'] },
    quarry: { host: 'quarry', unit: 'module', path: (name: string) => `src/${name}.ts`, parts: ['csv', 'parquet', 'jsonl', 'avro', 's3-sink', 'gcs-sink', 'sftp-sink', 'schema-infer', 'chunker', 'progress-bar', 'retry-policy', 'config-loader', 'manifest', 'checksum', 'compressor', 'scheduler', 'resume-log', 'column-filter', 'date-range', 'dry-run'] },
    tidewater: { host: 'tidewater', unit: 'module', path: (name: string) => `src/${name}/mod.ts`, parts: ['watcher', 'differ', 'uploader', 'downloader', 'conflict-resolver', 'journal', 'throttle', 'peer-discovery', 'handshake', 'keepalive', 'snapshotter', 'pruner', 'hasher', 'queue', 'backoff', 'tray-status', 'ignore-rules', 'quota-check', 'rename-detector', 'tombstones'] },
    bramble: { host: 'bramble', unit: 'service', path: (name: string) => `deploy/${name}/values.yaml`, parts: ['gateway', 'worker-pool', 'cron-runner', 'log-shipper', 'metrics-agent', 'secrets-mount', 'image-builder', 'cache-tier', 'db-proxy', 'queue-broker', 'object-store', 'dns-zone', 'cert-renewer', 'ingress', 'autoscaler', 'backup-job', 'audit-sink', 'feature-flags', 'mail-relay', 'search-index'] },
    kestrel: { host: 'kestrel', unit: 'page', path: (name: string) => `docs/${name}.md`, parts: ['quickstart', 'install-guide', 'auth-guide', 'api-reference', 'changelog', 'faq', 'glossary', 'migration-guide', 'tutorials', 'cli-reference', 'troubleshooting', 'release-notes', 'sdk-python', 'sdk-go', 'sdk-js', 'webhooks-guide', 'rate-limits', 'errors', 'pagination', 'search-page'] },
} satisfies Record<string, Project>;

const DONE = [
    (part: string, unit: string) => `Added regression tests for the ${part} ${unit}`,
    (part: string, unit: string) => `Removed the dead code from the ${part} ${unit}`,
    (part: string, unit: string) => `Rewrote the ${part} ${unit} against the new base`,
    (part: string, unit: string) => `Fixed the lint findings in the ${part} ${unit}`,
    (part: string, unit: string) => `Reviewed the ${part} ${unit} and found no open defect`,
    (part: string, unit: string) => `Added a worked example for the ${part} ${unit}`,
    (part: string, unit: string) => `Renamed the exports of the ${part} ${unit} to match the naming rule`,
    (part: string, unit: string) => `Measured the ${part} ${unit}: within the budget`,
];

const PASSED = [
    (part: string, unit: string): readonly [Section, ClosedWhy, string] => ['now', 'superseded', `Running the checks of the ${part} ${unit}`],
    (part: string, unit: string): readonly [Section, ClosedWhy, string] => ['next', 'done', `Open the review of the ${part} ${unit}`],
    (part: string, unit: string): readonly [Section, ClosedWhy, string] => ['now', 'superseded', `Reading the ${part} ${unit} before changing it`],
    (part: string, unit: string): readonly [Section, ClosedWhy, string] => ['next', 'done', `Rebase the ${part} ${unit} branch on main`],
    (part: string, unit: string): readonly [Section, ClosedWhy, string] => ['now', 'done', `Waiting for the pipeline of the ${part} ${unit}`],
];

const f = (k: string, s: Section, at: number, t: string, more: Partial<Pick<Draft, 'why' | 'ref' | 'closed'>> = {}): Draft => ({ k, s, at, t, ...more });

const PLANS: readonly Plan[] = [
    {
        id: 'cs-01-plain-small', project: 'orchard', name: 'Refund endpoint idempotency', language: 'en', plants: ['plain'], size: 'small', span: 90, total: 6,
        core: [
            f('goal', 'goal', 0, 'Make POST /refunds safe to retry without paying a customer twice'),
            f('col', 'done', 14, 'Added an idempotency_key column to the refunds table in migration 0042', { ref: 'src/db/migrations/0042_refund_keys.sql' }),
            f('dec', 'decisions', 24, 'Reject a repeated key with 409 instead of replaying the first response', { why: 'replaying needs the stored response body, which the table does not keep' }),
            f('h409', 'done', 46, 'The refund handler now returns 409 on a repeated key; 6 new tests pass', { ref: 'test/refunds/idempotency.test.ts' }),
            f('next', 'next', 62, 'Backfill idempotency_key for refunds created before migration 0042'),
            f('link', 'links', 64, 'Refund handler', { ref: 'src/refunds/handler.ts' }),
        ],
    },
    {
        id: 'cs-02-plain-small', project: 'kestrel', name: 'Quickstart rewrite', language: 'en', plants: ['plain'], size: 'small', span: 75, total: 7,
        core: [
            f('goal', 'goal', 0, 'Shorten the quickstart so a reader makes a first API call in under five minutes'),
            f('rule', 'rules', 6, 'Docs samples must run as pasted; no placeholder tokens'),
            f('cut', 'done', 20, 'Cut the quickstart from 11 steps to 4', { ref: 'docs/quickstart.md' }),
            f('curl', 'done', 40, 'Replaced the curl sample with one that runs against sandbox.kestrel.test without a key'),
            f('dec', 'decisions', 46, 'Keep the install section on its own page', { why: 'the SDK installers differ per language and tripled the page length' }),
            f('now', 'now', 68, 'Checking every code sample in the quickstart against the sandbox'),
            f('next', 'next', 70, 'Add the quickstart to the list of the link checker'),
        ],
    },
    {
        id: 'cs-03-plain-medium', project: 'lantern', name: 'Table pager keyboard support', language: 'en', plants: ['plain'], size: 'medium', span: 300, total: 16,
        core: [
            f('goal', 'goal', 0, 'Make the table pager fully usable from the keyboard'),
            f('rule', 'rules', 1, 'Every interactive component ships with a keyboard spec'),
            f('read', 'now', 3, 'Reading how TablePager handles focus today', { closed: ['superseded', 8] }),
            f('page', 'done', 12, 'PageUp and PageDown now move one page in TablePager', { ref: 'src/table-pager/keys.ts' }),
            f('home', 'done', 20, 'Home and End jump to the first and last page of the table'),
            f('dec', 'decisions', 24, 'Arrow keys stay with the table cells, not the pager', { why: 'the grid already uses arrows for cell focus and two handlers fought over them' }),
            f('live', 'done', 40, 'Added an aria-live region that announces the page number on every page change'),
            f('now', 'now', 92, 'Writing the Playwright keyboard spec for the pager', { ref: 'e2e/table-pager.spec.ts' }),
            f('next', 'next', 93, 'Run the axe audit on the orders table page'),
        ],
    },
    {
        id: 'cs-04-plain-small-es', project: 'quarry', name: 'Reanudar una exportación fallida', language: 'es', plants: ['plain', 'language-es'], size: 'small', span: 110, total: 5,
        core: [
            f('goal', 'goal', 0, 'Permitir que quarry export continúe desde el último bloque terminado después de un fallo'),
            f('log', 'done', 22, 'El registro de reanudación guarda cada bloque terminado con su suma de verificación', { ref: 'src/resume-log.ts' }),
            f('dec', 'decisions', 30, 'La reanudación solo se activa con la opción --resume', { why: 'una reanudación silenciosa podría mezclar filas de dos instantáneas distintas del origen' }),
            f('skip', 'done', 71, 'quarry export --resume omite los bloques cuya suma coincide con el registro; verificado en una exportación de 40 bloques'),
            f('next', 'next', 80, 'Documentar la opción --resume en la referencia de la CLI'),
        ],
    },
    {
        id: 'cs-05-verbatim-small', project: 'tidewater', name: 'Ignore rules for temp files', language: 'en', plants: ['verbatim-copy'], size: 'small', span: 100, total: 7,
        core: [
            f('goal', 'goal', 0, 'Stop tidewater from syncing editor temp files'),
            f('rule', 'rules', 5, 'Never delete a file of the user because of an ignore rule'),
            f('ign', 'done', 22, 'Added *.swp, *~ and .#* to the default ignore rules', { ref: 'src/ignore-rules/defaults.ts' }),
            f('dec', 'decisions', 35, 'Ignore rules are matched on the file name only, not the full path', { why: 'path matching made the watcher 3 times slower on deep trees' }),
            f('drop', 'done', 58, 'The watcher drops ignored files before hashing them'),
            f('next', 'next', 85, 'Add a tidewater ignore --list command that shows the active rules'),
        ],
        copies: [{ of: 'ign', k: 'ign2', at: 70 }],
    },
    {
        id: 'cs-06-verbatim-medium', project: 'orchard', name: 'Coupon stacking rules', language: 'en', plants: ['verbatim-copy'], size: 'medium', span: 380, total: 20,
        core: [
            f('goal', 'goal', 0, 'Allow at most one percentage coupon and one fixed coupon per cart'),
            f('link', 'links', 1, 'Coupon rules ticket', { ref: 'https://tracker.orchard.test/t/ORC-2291' }),
            f('vo', 'next', 4, 'Write the CouponStack value object', { closed: ['done', 22] }),
            f('dec', 'decisions', 15, 'Apply the fixed coupon before the percentage coupon', { why: 'finance wants the percentage taken on the already reduced total' }),
            f('rej', 'done', 30, 'CouponStack rejects a second percentage coupon with error code COUPON_STACK_LIMIT', { ref: 'src/coupons/stack.ts' }),
            f('prop', 'done', 52, 'A property test covers 500 random carts and finds no negative total'),
            f('now', 'now', 90, 'Wiring the stack check into the cart checkout path'),
            f('next', 'next', 91, 'Update the API reference for the COUPON_STACK_LIMIT error'),
        ],
        copies: [{ of: 'dec', k: 'dec2', at: 63 }],
    },
    {
        id: 'cs-07-verbatim-waiting-medium', project: 'bramble', name: 'Rotate the gateway certificates', language: 'en', plants: ['verbatim-copy', 'waiting-on-operator'], size: 'medium', span: 520, total: 24,
        core: [
            f('goal', 'goal', 0, 'Rotate the gateway TLS certificates before they expire on 2026-12-01'),
            f('rule', 'rules', 2, 'No production change without an approved window'),
            f('issued', 'done', 14, 'cert-renewer issued new certificates for gw.bramble.test and api.bramble.test'),
            f('ca', 'needs', 20, 'Operator must say whether the old intermediate CA can be dropped from the bundle', { closed: ['answered', 41] }),
            f('cadec', 'decisions', 42, 'Keep the old intermediate CA in the bundle until 2027-01-15', { why: 'the operator said two partner clients still pin it' }),
            f('stg', 'done', 55, 'The staging gateway serves the new certificate and the handshake check passes'),
            f('dec', 'decisions', 60, 'Roll production one region at a time', { why: 'a bad certificate in every region at once would take the whole gateway down' }),
            f('win', 'needs', 78, 'Operator must approve the production rollout window: Tuesday 02:00 UTC or Thursday 02:00 UTC'),
            f('next', 'next', 80, 'Roll the certificate to production region eu-1 first'),
        ],
        copies: [{ of: 'stg', k: 'stg2', at: 88 }],
        waiting: { keys: ['win'], gist: 'the operator has to approve the production rollout window (Tuesday or Thursday, 02:00 UTC)' },
        closed: [{ k: 'ca', must_not_say: 'that the question about dropping the old intermediate CA still waits on the operator', current: 'cadec' }],
    },
    {
        id: 'cs-08-verbatim-large', project: 'quarry', name: 'Parquet writer', language: 'en', plants: ['verbatim-copy'], size: 'large', span: 2900, total: 48,
        core: [
            f('goal', 'goal', 0, 'Add a Parquet writer to quarry export with the same options as the CSV writer'),
            f('rule', 'rules', 1, 'A writer never holds more than one chunk in memory'),
            f('notes', 'links', 3, 'Parquet format notes', { ref: 'docs/notes/parquet-format.md' }),
            f('rg', 'decisions', 18, 'Write one row group per 50000 rows', { why: 'larger groups ran the 512 MB container out of memory' }),
            f('ts', 'done', 30, 'Timestamps are written as INT64 microseconds in UTC'),
            f('decm', 'decisions', 44, 'Decimal columns keep the source precision', { why: 'rounding to double changed 3 totals in the finance fixture' }),
            f('rt', 'done', 61, 'The Parquet writer passes the 14 round-trip fixtures', { ref: 'test/parquet/roundtrip.test.ts' }),
            f('now', 'now', 96, 'Profiling memory on the 2 GB orders fixture'),
            f('next', 'next', 97, 'Add --compression zstd to the Parquet writer'),
        ],
        copies: [{ of: 'rt', k: 'rt2', at: 83 }, { of: 'notes', k: 'notes2', at: 52 }],
    },
    {
        id: 'cs-09-verbatim-closed-large', project: 'lantern', name: 'Dashboard date range filter', language: 'en', plants: ['verbatim-copy', 'closed-tempting'], size: 'large', span: 4100, total: 64,
        core: [
            f('goal', 'goal', 0, 'Add a date range filter to the revenue dashboard that survives a page reload'),
            f('rule', 'rules', 1, 'No state that a shared link cannot reproduce'),
            f('ls', 'decisions', 6, 'Store the selected range in localStorage', { why: 'it was the quickest way to survive a reload', closed: ['superseded', 28] }),
            f('url', 'decisions', 28, 'Store the selected range in the URL query string', { why: 'a shared link must open the same range, which localStorage cannot do' }),
            f('rw', 'done', 37, 'DateRangeFilter reads and writes ?from= and ?to= as ISO dates', { ref: 'src/filter-bar/date-range.ts' }),
            f('rm', 'done', 45, 'Removed the localStorage code path from DateRangeFilter'),
            f('leg', 'now', 58, 'The chart flicker comes from the legend re-rendering on every change', { closed: ['wrong', 66] }),
            f('flick', 'done', 70, 'The chart flicker came from the filter firing two fetches; the filter is now debounced by 200 ms'),
            f('now', 'now', 95, 'Adding the presets: last 7 days, last 30 days, this quarter'),
            f('next', 'next', 96, 'Add the selected range to the CSV export request'),
        ],
        copies: [{ of: 'rm', k: 'rm2', at: 77 }],
        closed: [
            { k: 'ls', must_not_say: 'that the selected range is stored in localStorage, as the current design', current: 'url' },
            { k: 'leg', must_not_say: 'that the chart flicker is caused by the legend re-rendering', current: 'flick' },
        ],
    },
    {
        id: 'cs-10-verbatim-medium-es', project: 'kestrel', name: 'Rate limits guide', language: 'es', plants: ['verbatim-copy', 'language-es'], size: 'medium', span: 260, total: 14,
        core: [
            f('goal', 'goal', 0, 'Write a rate limits guide that explains the 429 response and the Retry-After header'),
            f('draft', 'done', 22, 'Drafted the rate limits guide with the table per plan: Free 60, Team 600, Scale 6000 requests per minute', { ref: 'docs/rate-limits.md' }),
            f('dec', 'decisions', 30, 'Show the limits per minute, not per second', { why: 'the API enforces a sliding window of one minute' }),
            f('retry', 'done', 55, 'Added a retry example in Python and in Go that honours Retry-After'),
            f('now', 'now', 90, 'Linking the errors page to the rate limits guide'),
            f('next', 'next', 92, 'Add the JavaScript retry example'),
        ],
        copies: [{ of: 'draft', k: 'draft2', at: 70 }],
    },
    {
        id: 'cs-11-reworded-small', project: 'bramble', name: 'Worker pool autoscaling', language: 'en', plants: ['reworded-duplicate'], size: 'small', span: 120, total: 6,
        core: [
            f('goal', 'goal', 0, 'Make the worker pool scale on queue depth instead of CPU'),
            f('link', 'links', 4, 'Queue depth dashboard', { ref: 'https://grafana.bramble.test/d/queue-depth' }),
            f('weak', 'done', 30, 'The autoscaler now scales the worker pool on queue depth'),
            f('dec', 'decisions', 44, 'Scale down only after 10 minutes below the target', { why: 'shorter waits made the pool flap during the nightly batch' }),
            f('strong', 'done', 61, 'The autoscaler now scales the worker pool on a queue depth of 200 jobs per worker, between 2 and 12 workers', { ref: 'deploy/autoscaler/worker-pool.yaml' }),
            f('next', 'next', 88, 'Watch the pool through one nightly batch before removing the CPU rule'),
        ],
        reworded: [{ weak: 'weak', keep: 'strong' }],
    },
    {
        id: 'cs-12-reworded-waiting-medium', project: 'tidewater', name: 'Conflict copies on rename', language: 'en', plants: ['reworded-duplicate', 'waiting-on-operator'], size: 'medium', span: 420, total: 18,
        core: [
            f('goal', 'goal', 0, 'Stop tidewater from creating conflict copies when a folder is renamed on two peers'),
            f('read', 'now', 2, 'Reading the conflict-resolver code path for renames', { closed: ['superseded', 10] }),
            f('match', 'done', 16, 'rename-detector matches a renamed folder by inode and content hash', { ref: 'src/rename-detector/match.ts' }),
            f('dec', 'decisions', 27, 'A rename is journaled as one operation, not as a delete plus a create', { why: 'delete plus create lost the folder when the peer went offline in between' }),
            f('replay', 'done', 43, 'The journal replay test covers 9 orders of rename operations'),
            f('weak', 'needs', 60, 'Operator needs to decide what happens when both peers renamed the same folder'),
            f('strong', 'needs', 74, 'Operator must choose what happens when both peers renamed the same folder: keep the newer name, or keep both folders with a suffix'),
            f('now', 'now', 92, 'Reproducing the double rename on two local peers'),
            f('next', 'next', 93, 'Implement the double-rename policy once the operator has chosen it'),
        ],
        reworded: [{ weak: 'weak', keep: 'strong' }],
        waiting: { keys: ['strong', 'weak'], gist: 'the operator has to choose the policy for a folder renamed on both peers (keep the newer name, or keep both with a suffix)' },
    },
    {
        id: 'cs-13-reworded-medium', project: 'quarry', name: 'SFTP sink retries', language: 'en', plants: ['reworded-duplicate'], size: 'medium', span: 480, total: 22,
        core: [
            f('goal', 'goal', 0, 'Make the SFTP sink survive a dropped connection in the middle of an upload'),
            f('part', 'done', 12, 'An upload writes to a .part name and renames the file on success'),
            f('q', 'needs', 18, 'Operator must say whether partial files may be left on the server', { closed: ['answered', 33] }),
            f('qdec', 'decisions', 34, 'Delete the .part file after the last failed retry', { why: 'the operator does not want partial files left on the server of the customer' }),
            f('weak', 'done', 40, 'Added retry with backoff to the uploads of the SFTP sink'),
            f('dec', 'decisions', 52, 'Resume a chunk from byte zero, not from the offset', { why: 'the test server corrupted 2 of 30 files on an offset resume' }),
            f('strong', 'done', 66, 'The SFTP sink retries a failed chunk upload up to 5 times with backoff from 2 s to 32 s', { ref: 'src/sftp-sink/upload.ts' }),
            f('now', 'now', 94, 'Running the 30-file soak against sftp.quarry.test'),
            f('next', 'next', 95, 'Expose the retry count as the flag --sftp-retries'),
        ],
        reworded: [{ weak: 'weak', keep: 'strong' }],
        closed: [{ k: 'q', must_not_say: 'that the question about partial files on the server still waits on the operator', current: 'qdec' }],
    },
    {
        id: 'cs-14-reworded-near-large', project: 'orchard', name: 'Shipment webhooks v2', language: 'en', plants: ['reworded-duplicate', 'near-pair'], size: 'large', span: 5200, total: 80,
        core: [
            f('goal', 'goal', 0, 'Ship version 2 of the shipment webhooks with signed payloads'),
            f('rule', 'rules', 1, 'A webhook secret is never logged'),
            f('design', 'links', 2, 'Webhook v2 design', { ref: 'docs/design/webhooks-v2.md' }),
            f('strong', 'done', 21, 'Webhook payloads are signed with HMAC-SHA256 in the X-Orchard-Signature header', { ref: 'src/webhooks/sign.ts' }),
            f('node', 'done', 34, 'A signature verification example was added to the Node SDK guide'),
            f('py', 'done', 39, 'A signature verification example was added to the Python SDK guide'),
            f('weak', 'done', 47, 'Payload signing for the webhooks is in place'),
            f('stg', 'done', 62, 'Staging sends v2 webhooks to all test merchants'),
            f('prod', 'done', 81, 'Production sends v2 webhooks to the 3 pilot merchants'),
            f('now', 'now', 96, 'Migrating the secrets of the remaining v1 subscribers'),
            f('next', 'next', 97, 'Announce the v1 shutdown date to the merchants'),
        ],
        reworded: [{ weak: 'weak', keep: 'strong' }],
        near: [['node', 'py'], ['stg', 'prod']],
    },
    {
        id: 'cs-15-near-small', project: 'lantern', name: 'Focus return on close', language: 'en', plants: ['near-pair'], size: 'small', span: 95, total: 6,
        core: [
            f('goal', 'goal', 0, 'Return focus to the opening control when an overlay closes'),
            f('modal', 'done', 24, 'Focus returns to the opener when the modal closes', { ref: 'src/modal/focus.ts' }),
            f('dec', 'decisions', 33, 'The tooltip is excluded from focus return', { why: 'a tooltip never takes focus in the first place' }),
            f('menu', 'done', 52, 'Focus returns to the opener when the avatar menu closes', { ref: 'src/avatar-menu/focus.ts' }),
            f('now', 'now', 80, 'Writing the shared useFocusReturn hook', { ref: 'src/shared/use-focus-return.ts' }),
            f('next', 'next', 82, 'Apply the same focus return to the dropzone dialog'),
        ],
        near: [['modal', 'menu']],
    },
    {
        id: 'cs-16-near-medium', project: 'bramble', name: 'Backup job retention', language: 'en', plants: ['near-pair'], size: 'medium', span: 560, total: 20,
        core: [
            f('goal', 'goal', 0, 'Set the backup retention so that storage stays under the 2 TB quota'),
            f('rule', 'rules', 2, 'A backup that was never restored does not count'),
            f('main', 'decisions', 18, 'Keep daily backups of db-main for 14 days', { why: 'the last 3 restores all went back less than 10 days' }),
            f('ana', 'decisions', 23, 'Keep daily backups of db-analytics for 7 days', { why: 'analytics can be rebuilt from db-main in a day' }),
            f('dmain', 'done', 49, 'The restore drill passed for db-main on staging in 38 minutes'),
            f('dana', 'done', 63, 'The restore drill passed for db-analytics on staging in 12 minutes'),
            f('now', 'now', 93, 'Measuring object-store usage after the first pruning run'),
            f('next', 'next', 94, 'Run the db-main restore drill on production hardware'),
        ],
        near: [['main', 'ana'], ['dmain', 'dana']],
    },
    {
        id: 'cs-17-near-medium', project: 'kestrel', name: 'SDK install pages', language: 'en', plants: ['near-pair'], size: 'medium', span: 640, total: 26,
        core: [
            f('goal', 'goal', 0, 'Give each SDK its own install page with a verified first call'),
            f('split', 'next', 2, 'Split the old combined install page', { closed: ['done', 14] }),
            f('dec', 'decisions', 9, 'One install page per SDK, without tabs', { why: 'tabbed pages hid two languages from the site search' }),
            f('py', 'done', 31, 'The Python SDK install page shows the pip and uv commands, verified on Python 3.12', { ref: 'docs/sdk-python/install.md' }),
            f('go', 'done', 48, 'The Go SDK install page shows the go get command, verified on Go 1.23', { ref: 'docs/sdk-go/install.md' }),
            f('now', 'now', 90, 'Writing the JavaScript SDK install page'),
            f('node', 'next', 92, 'Verify the JavaScript SDK install page on Node 22'),
            f('deno', 'next', 93, 'Verify the JavaScript SDK install page on Deno 2'),
        ],
        near: [['py', 'go'], ['node', 'deno']],
    },
    {
        id: 'cs-18-near-closed-large', project: 'tidewater', name: 'Bandwidth throttle and storage quota', language: 'en', plants: ['near-pair', 'closed-tempting'], size: 'large', span: 5600, total: 96,
        core: [
            f('goal', 'goal', 0, 'Keep tidewater under the bandwidth limit and the storage quota of the user'),
            f('rule', 'rules', 1, 'Never drop a queued change because of a limit'),
            f('sleep', 'decisions', 8, 'Throttle with a fixed sleep between chunks', { why: 'it was the simplest thing to write', closed: ['superseded', 26] }),
            f('bucket', 'decisions', 26, 'Throttle with a token bucket refilled every 100 ms', { why: 'the fixed sleep overshot the limit by 40 % on small chunks' }),
            f('up', 'done', 38, 'The upload throttle honours the limit set in the settings: tested at 1 MB/s'),
            f('down', 'done', 46, 'The download throttle honours the limit set in the settings: tested at 1 MB/s'),
            f('q', 'needs', 55, 'Operator must decide whether a full quota pauses the whole sync or only the uploads', { closed: ['answered', 68] }),
            f('qdec', 'decisions', 69, 'A full quota pauses uploads only; downloads continue', { why: 'the operator wants deletions and remote edits to keep arriving' }),
            f('now', 'now', 96, 'Adding the quota state to the tray status'),
            f('next', 'next', 97, 'Warn the user at 90 % of the quota'),
        ],
        near: [['up', 'down']],
        closed: [
            { k: 'sleep', must_not_say: 'that the throttle uses a fixed sleep between chunks, as the current design', current: 'bucket' },
            { k: 'q', must_not_say: 'that the behaviour on a full quota still waits on the operator', current: 'qdec' },
        ],
    },
    {
        id: 'cs-19-closed-small', project: 'quarry', name: 'Schema inference for dates', language: 'en', plants: ['closed-tempting'], size: 'small', span: 115, total: 7,
        core: [
            f('old', 'goal', 0, 'Infer every date column automatically from the first 1000 rows', { closed: ['superseded', 36] }),
            f('iso', 'done', 20, 'schema-infer recognises ISO 8601 dates and day-first dates', { ref: 'src/schema-infer/dates.ts' }),
            f('all', 'done', 28, 'All 22 schema fixtures pass with date inference turned on', { closed: ['wrong', 34] }),
            f('dec', 'decisions', 36, 'Date inference is opt-in', { why: 'automatic inference turned 2 product-code columns into dates in the retail fixture' }),
            f('goal', 'goal', 37, 'Infer date columns only when the flag --infer-dates is set; otherwise keep them as strings'),
            f('now', 'now', 80, 'Fixing the 2 retail fixtures that fail with date inference turned on'),
            f('next', 'next', 82, 'Add a warning when a column is ambiguous between day-first and month-first'),
        ],
        closed: [
            { k: 'old', must_not_say: 'that the goal is to infer every date column automatically', current: 'goal' },
            { k: 'all', must_not_say: 'that all 22 schema fixtures pass with date inference on', current: 'now' },
        ],
    },
    {
        id: 'cs-20-closed-answered-small', project: 'orchard', name: 'Tax rounding per line', language: 'en', plants: ['closed-tempting'], size: 'small', span: 105, total: 6,
        core: [
            f('goal', 'goal', 0, 'Round tax per line item instead of per order'),
            f('q', 'needs', 12, 'Operator must confirm whether existing invoices are recalculated', { closed: ['answered', 39] }),
            f('calc', 'done', 30, 'Tax is rounded half-up per line in TaxCalculator', { ref: 'src/taxes/calculator.ts' }),
            f('dec', 'decisions', 40, 'Existing invoices are not recalculated', { why: 'the operator confirmed that issued invoices are legal documents and must not change' }),
            f('ref', 'done', 66, 'The totals match the 18 reference invoices from finance'),
            f('next', 'next', 84, 'Enable per-line rounding behind the flag tax_line_rounding in staging'),
        ],
        closed: [{ k: 'q', must_not_say: 'that the recalculation of existing invoices still waits on the operator', current: 'dec' }],
    },
    {
        id: 'cs-21-closed-waiting-medium', project: 'lantern', name: 'Global search box speed', language: 'en', plants: ['closed-tempting', 'waiting-on-operator'], size: 'medium', span: 600, total: 28,
        core: [
            f('goal', 'goal', 0, 'Make the global search box feel instant on the orders page'),
            f('d500', 'decisions', 8, 'Debounce the search input by 500 ms', { why: 'it cut the requests the most in the first test', closed: ['superseded', 44] }),
            f('meas', 'now', 12, 'Measuring request counts with the 500 ms debounce', { closed: ['superseded', 30] }),
            f('abort', 'done', 36, 'SearchBox cancels the in-flight request with AbortController', { ref: 'src/search-box/request.ts' }),
            f('d150', 'decisions', 44, 'Debounce the search input by 150 ms and cancel the previous request', { why: 'the 500 ms debounce felt broken to the 4 testers' }),
            f('arch', 'needs', 63, 'Operator must decide whether search results may show archived orders'),
            f('now', 'now', 92, 'Building the empty state for a search with zero results'),
            f('next', 'next', 93, 'Add the keyboard shortcut / to focus the search box'),
        ],
        waiting: { keys: ['arch'], gist: 'the operator has to decide whether search results may show archived orders' },
        closed: [{ k: 'd500', must_not_say: 'that the search input is debounced by 500 ms, as the current decision', current: 'd150' }],
    },
    {
        id: 'cs-22-closed-medium-es', project: 'tidewater', name: 'Snapshot pruning', language: 'es', plants: ['closed-tempting', 'language-es'], size: 'medium', span: 340, total: 16,
        core: [
            f('goal', 'goal', 0, 'Prune old snapshots so that the journal stays under 1 GB'),
            f('age', 'decisions', 10, 'Prune the snapshots older than 30 days', { why: 'it matches the old default', closed: ['superseded', 38] }),
            f('count', 'decisions', 38, 'Keep the newest 20 snapshots regardless of their age', { why: 'a laptop left off for 6 weeks lost every snapshot under the age rule' }),
            f('impl', 'done', 54, 'The pruner keeps the newest 20 snapshots and deletes the rest', { ref: 'src/pruner/policy.ts' }),
            f('when', 'done', 66, 'Pruning runs after each successful snapshot, not on a timer'),
            f('now', 'now', 91, 'Testing the pruner on a journal with 300 snapshots'),
            f('next', 'next', 93, 'Show the snapshot count in tidewater status'),
        ],
        closed: [{ k: 'age', must_not_say: 'that snapshots older than 30 days are pruned, as the current rule', current: 'count' }],
    },
    {
        id: 'cs-23-closed-waiting-large', project: 'bramble', name: 'Move the queue broker to the new cluster', language: 'en', plants: ['closed-tempting', 'waiting-on-operator'], size: 'large', span: 5700, total: 112,
        core: [
            f('goal', 'goal', 0, 'Move queue-broker from cluster old-a to cluster new-b without losing a message'),
            f('rule', 'rules', 1, 'Cluster old-a stays up until the operator signs off'),
            f('one', 'decisions', 5, 'Cut over in one step during a 30-minute maintenance window', { why: 'it was the simplest plan', closed: ['superseded', 19] }),
            f('mirror', 'decisions', 19, 'Mirror the queues to new-b and move the consumers service by service', { why: 'the operator rejected any downtime for mail-relay' }),
            f('ret', 'needs', 27, 'Operator must confirm the message retention on new-b', { closed: ['answered', 35] }),
            f('retdec', 'decisions', 36, 'Message retention on new-b is 7 days, the same as on old-a', { why: 'the operator confirmed that no consumer needs more' }),
            f('all9', 'done', 71, 'All 9 consumers are moved to new-b', { closed: ['wrong', 76] }),
            f('seven', 'done', 77, '7 of the 9 consumers read from new-b; cron-runner and audit-sink still read from old-a'),
            f('fw', 'needs', 84, 'Operator must provide the firewall change that lets audit-sink reach new-b on port 5671'),
            f('now', 'now', 96, 'Moving the consumer of cron-runner to new-b'),
            f('next', 'next', 97, 'Delete the mirrors once both remaining consumers are moved'),
        ],
        waiting: { keys: ['fw'], gist: 'the operator has to provide the firewall change so that audit-sink reaches new-b on port 5671' },
        closed: [
            { k: 'one', must_not_say: 'that the plan is a one-step cutover in a maintenance window', current: 'mirror' },
            { k: 'all9', must_not_say: 'that all 9 consumers are moved to new-b', current: 'seven' },
            { k: 'ret', must_not_say: 'that the message retention on new-b still waits on the operator', current: 'retdec' },
        ],
    },
    {
        id: 'cs-24-waiting-small', project: 'kestrel', name: 'Changelog automation', language: 'en', plants: ['waiting-on-operator'], size: 'small', span: 85, total: 5,
        core: [
            f('goal', 'goal', 0, 'Generate the changelog page from the labels of merged pull requests'),
            f('gen', 'done', 26, 'scripts/changelog.ts builds docs/changelog.md from the labels feature, fix and breaking', { ref: 'scripts/changelog.ts' }),
            f('dec', 'decisions', 39, 'An unlabelled pull request fails the docs build', { why: 'silently skipped entries left 5 fixes out of release 3.2' }),
            f('int', 'needs', 58, 'Operator must decide whether internal-only changes appear in the public changelog'),
            f('next', 'next', 81, 'Run the generator on the last 3 releases and compare the result with the hand-written pages'),
        ],
        waiting: { keys: ['int'], gist: 'the operator has to decide whether internal-only changes appear in the public changelog' },
    },
];

function rngOf(seed: string): () => number {
    let state = createHash('sha256').update(seed).digest().readUInt32LE(0);
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let mixed = Math.imul(state ^ (state >>> 15), state | 1);
        mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
        return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
    };
}

const BASE32 = '0123456789abcdefghjkmnpqrstvwxyz';

function factId(seed: string): FactId {
    const bytes = createHash('sha256').update(seed).digest();
    let out = '';
    for (let index = 0; index < 26; index += 1) {
        out += BASE32.charAt((bytes[index] ?? 0) % 32);
    }
    return `fact_${out}` as FactId;
}

interface Timed extends Draft {
    readonly minute: number;
}

function shuffled<T>(list: readonly T[], rng: () => number): T[] {
    const out = [...list];
    for (let index = out.length - 1; index > 0; index -= 1) {
        const pick = Math.floor(rng() * (index + 1));
        [out[index], out[pick]] = [out[pick] as T, out[index] as T];
    }
    return out;
}

function fillerOf(plan: Plan, taken: Set<number>, rng: () => number): Timed[] {
    const copies = plan.copies ?? [];
    const count = plan.total - plan.core.length - copies.length;
    if (count < 0) {
        throw new Error(`${plan.id}: total ${plan.total} is under its ${plan.core.length + copies.length} written facts`);
    }
    const project: Project = PROJECTS[plan.project];
    const parts = shuffled(project.parts, rng);
    const passedParts = shuffled(project.parts, rng);
    const linkParts = shuffled(project.parts, rng);
    const closedShare = plan.size === 'large' ? 0.26 : 0.16;
    const runs = new Set<number>();
    const out: Timed[] = [];
    let [done, passed, links] = [0, 0, 0];
    for (let index = 0; index < count; index += 1) {
        let minute = 2 + Math.floor(rng() * (plan.span - 6));
        while (taken.has(minute)) {
            minute = minute + 1 >= plan.span - 2 ? 2 : minute + 1;
        }
        taken.add(minute);
        const at = (minute / plan.span) * 100;
        const roll = rng();
        if (roll < 0.22) {
            if (links % 2 === 0 && links / 2 < linkParts.length) {
                const part = linkParts[links / 2] as string;
                out.push({ k: `x${index}`, s: 'links', at, minute, t: `${part} ${project.unit} source`, ref: project.path(part) });
            } else {
                let run = 4000 + Math.floor(rng() * 5000);
                while (runs.has(run)) {
                    run += 1;
                }
                runs.add(run);
                out.push({ k: `x${index}`, s: 'links', at, minute, t: `CI run ${run}`, ref: `https://ci.${project.host}.test/runs/${run}` });
            }
            links += 1;
        } else if (roll < 0.22 + closedShare && passed < passedParts.length * PASSED.length) {
            const part = passedParts[passed % passedParts.length] as string;
            const round = Math.floor(passed / passedParts.length);
            const make = PASSED[((passed % passedParts.length) + round * 2) % PASSED.length] as (typeof PASSED)[number];
            const [section, why, text] = make(part, project.unit);
            const until = Math.min(plan.span - 1, minute + 5 + Math.floor(rng() * 55));
            out.push({ k: `x${index}`, s: section, at, minute, t: text, closed: [why, (until / plan.span) * 100] });
            passed += 1;
        } else {
            const part = parts[done % parts.length] as string;
            const round = Math.floor(done / parts.length);
            const make = DONE[((done % parts.length) + round * 3) % DONE.length] as (typeof DONE)[number];
            const withRef = rng() < 0.38;
            out.push({ k: `x${index}`, s: 'done', at, minute, t: make(part, project.unit), ...(withRef ? { ref: project.path(part) } : {}) });
            done += 1;
        }
    }
    return out;
}

function build(plan: Plan, index: number): Record<string, unknown> {
    const rng = rngOf(plan.id);
    const start = NOW - plan.span * MINUTE;
    const minuteOf = (at: number): number => Math.round((at / 100) * plan.span);
    const byKey = new Map(plan.core.map((draft) => [draft.k, draft] as const));
    const copied = (plan.copies ?? []).map((copy): Draft => {
        const source = byKey.get(copy.of);
        if (source === undefined || source.closed !== undefined) {
            throw new Error(`${plan.id}: copy of ${copy.of} needs an open written fact`);
        }
        return { ...source, k: copy.k, at: copy.at };
    });
    const written: Timed[] = [...plan.core, ...copied].map((draft) => ({ ...draft, minute: minuteOf(draft.at) }));
    const taken = new Set<number>();
    for (const one of written) {
        if (taken.has(one.minute)) {
            throw new Error(`${plan.id}: two written facts share minute ${one.minute} (${one.k})`);
        }
        taken.add(one.minute);
    }
    const all = [...written, ...fillerOf(plan, taken, rng)];
    const task = { tab: `tab-${String(index + 1).padStart(2, '0')}`, key: `t${(index % 7) + 1}` };
    const keyed = all.map((draft) => {
        const firstAt = start + draft.minute * MINUTE;
        const closedAt = draft.closed === undefined ? null : Math.min(NOW - MINUTE, Math.max(firstAt + MINUTE, start + minuteOf(draft.closed[1]) * MINUTE));
        const lastAt = Math.min(closedAt ?? NOW, firstAt + (1 + Math.floor(rng() * 12)) * MINUTE);
        const fact: Fact = {
            id: factId(`${plan.id}/${draft.k}`), task, section: draft.s, text: draft.t, why: draft.why ?? null, ref: draft.ref ?? null, agent: plan.name, anchor: null,
            firstAt, lastAt, state: draft.closed === undefined ? 'open' : 'closed', closedWhy: draft.closed?.[0] ?? null, closedAt, language: plan.language === 'es' && plan.id.includes('plain') ? 'es' : 'en',
        };
        return { key: draft.k, fact };
    }).sort((a, b) => a.fact.firstAt - b.fact.firstAt || (a.fact.id < b.fact.id ? -1 : 1));
    const facts = keyed.map((one) => one.fact);
    const clock = { now: NOW, zone: ZONE };
    const material = { name: plan.name, language: plan.language, facts, clock };
    const { document, facts: named } = curatorInput({ ...material, rubric: '' });
    const idOf = (key: string): string => {
        const at = keyed.findIndex((one) => one.key === key);
        if (at === -1) {
            throw new Error(`${plan.id}: no fact with key ${key}`);
        }
        return `f${at + 1}`;
    };
    const time = (ms: number): string => localTime(ms, NOW, ZONE);
    const allowed = new Set<string>();
    for (const source of [plan.name, ...facts.flatMap((fact) => [fact.text, fact.why ?? '', fact.ref ?? ''])]) {
        for (const token of checkedTokens(source)) {
            allowed.add(token);
        }
    }
    const times = new Set<string>([new Date(NOW).toISOString().slice(0, 10), time(NOW), ...facts.flatMap((fact) => [time(fact.firstAt), time(fact.lastAt), ...(fact.closedAt === null ? [] : [time(fact.closedAt)])])]);
    if (named.size !== facts.length) {
        throw new Error(`${plan.id}: the input builder named ${named.size} of ${facts.length} facts`);
    }
    const open = facts.filter((fact) => fact.state === 'open').length;
    return {
        id: plan.id,
        plants: plan.plants,
        tags: [plan.size, plan.project, plan.language, ...plan.plants],
        shape: { facts: facts.length, open, closed: facts.length - open, document_bytes_without_rubric: Buffer.byteLength(document) },
        input: material,
        expected: {
            merge_pairs: [
                ...(plan.copies ?? []).map((copy) => ({ ids: [idOf(copy.of), idOf(copy.k)], kind: 'verbatim', keep: null })),
                ...(plan.reworded ?? []).map((pair) => ({ ids: [idOf(pair.weak), idOf(pair.keep)], kind: 'reworded', keep: idOf(pair.keep) })),
            ],
            no_merge: (plan.near ?? []).map(([first, second]) => [idOf(first), idOf(second)]),
            waiting_on_operator: plan.waiting === undefined ? null : { ids: plan.waiting.keys.map(idOf), gist: plan.waiting.gist },
            closed_ids: (plan.closed ?? []).map((one) => ({ id: idOf(one.k), closed_why: byKey.get(one.k)?.closed?.[0] ?? null, must_not_say: one.must_not_say, current: one.current === null ? null : idOf(one.current) })),
            names_and_numbers: [...allowed].sort(),
            times: [...times].sort(),
        },
    };
}

const lines = PLANS.map((plan, index) => JSON.stringify(build(plan, index)));
writeFileSync(new URL('./dataset.jsonl', import.meta.url), `${lines.join('\n')}\n`);
console.log(`${lines.length} items written`);
