import type { ClosedWhy, Section } from '../../packages/session-ledger/src/recap/domain/fact.ts';

// FRESH-1b: the fresh items of curator-story. All projects, names, places and hosts are invented; hosts end in .test.
// The shapes mirror `Draft`, `Project` and `Plan` of build-dataset.ts (which cannot be imported: it writes dataset.jsonl
// when loaded). A plan reads exactly as a PLANS entry: `core` facts by key (`k`), `at` in percent of `span`, `closed`
// as [why, at percent], `copies` copied by code, `reworded` pairs, `near` pairs, `waiting` and `closed` keys.
// In a trap, `id` and `into` hold fact keys; the builder maps them to document ids as it maps the keys of `expected`.
// Each item has one primary plant (the first entry of `plants`); every trap kind is one of the item's plants.

export interface FreshDraft {
    readonly k: string;
    readonly s: Section;
    readonly at: number;
    readonly t: string;
    readonly why?: string;
    readonly ref?: string;
    readonly closed?: readonly [ClosedWhy, number];
}

export interface FreshProject {
    readonly host: string;
    readonly unit: string;
    readonly path: (name: string) => string;
    readonly parts: readonly string[];
}

export type FreshProjectName = 'driftwood' | 'ironbark' | 'marigold' | 'pinecrest' | 'sparrowgate' | 'cobblestone';

export interface TrapOp {
    readonly op: 'close';
    readonly id: string;
    readonly why: 'done' | 'answered' | 'merged';
    readonly into?: string;
}

export interface Trap {
    readonly kind: string;
    readonly ops: readonly TrapOp[];
    readonly expect: 'refused' | 'kept';
}

export interface FreshPlan {
    readonly id: string;
    readonly project: FreshProjectName;
    readonly name: string;
    readonly language: 'en' | 'es';
    readonly plants: readonly string[];
    readonly size: 'small' | 'medium' | 'large';
    readonly span: number;
    readonly total: number;
    readonly core: readonly FreshDraft[];
    readonly copies?: readonly { readonly of: string; readonly k: string; readonly at: number }[];
    readonly reworded?: readonly { readonly weak: string; readonly keep: string }[];
    readonly near?: readonly (readonly [string, string])[];
    readonly waiting?: { readonly keys: readonly string[]; readonly gist: string };
    readonly closed?: readonly { readonly k: string; readonly must_not_say: string; readonly current: string | null }[];
    readonly traps: readonly Trap[];
}

export const FRESH_PROJECTS = {
    driftwood: { host: 'driftwood', unit: 'screen', path: (name: string) => `app/screens/${name}.tsx`, parts: ['login-form', 'site-list', 'photo-picker', 'offline-queue', 'sync-banner', 'map-view', 'checklist', 'signature-pad', 'report-preview', 'settings-panel', 'camera-roll', 'pin-entry', 'voice-note', 'barcode-scan', 'weather-card', 'job-timer', 'crew-list', 'upload-tray', 'damage-sketch', 'help-sheet'] },
    ironbark: { host: 'ironbark', unit: 'handler', path: (name: string) => `services/${name}/handler.go`, parts: ['timesheets', 'overtime', 'leave-balance', 'pay-runs', 'deductions', 'bank-export', 'payslips', 'expenses', 'mileage', 'bonuses', 'tax-forms', 'holiday-calendar', 'rota', 'clock-in', 'approvals', 'audit-trail', 'cost-centres', 'grades', 'contracts', 'onboarding'] },
    marigold: { host: 'marigold', unit: 'template', path: (name: string) => `themes/marigold/${name}.html`, parts: ['hero-banner', 'pricing-grid', 'team-page', 'press-kit', 'event-list', 'newsletter-form', 'footer-links', 'case-studies', 'careers-board', 'blog-index', 'author-card', 'cookie-notice', 'contact-form', 'podcast-feed', 'gallery-strip', 'partner-logos', 'status-page', 'sitemap', 'landing-variant', 'donation-box'] },
    pinecrest: { host: 'pinecrest', unit: 'chart', path: (name: string) => `charts/${name}/Chart.yaml`, parts: ['edge-proxy', 'job-scheduler', 'vault-agent', 'log-router', 'trace-collector', 'blob-cache', 'session-store', 'rate-limiter', 'dns-resolver', 'image-registry', 'canary-controller', 'node-exporter', 'queue-relay', 'shard-manager', 'config-sync', 'health-probe', 'sidecar-injector', 'policy-engine', 'snapshot-agent', 'pager-bridge'] },
    sparrowgate: { host: 'sparrowgate', unit: 'package', path: (name: string) => `packages/${name}/src/index.ts`, parts: ['tokenizer', 'lexer', 'formatter', 'linter-core', 'plugin-host', 'cache-store', 'watch-mode', 'glob-matcher', 'source-maps', 'diagnostics', 'config-schema', 'lsp-bridge', 'test-runner', 'bench-suite', 'path-utils', 'color-output', 'arg-parser', 'telemetry-switch', 'update-check', 'error-codes'] },
    cobblestone: { host: 'cobblestone', unit: 'model', path: (name: string) => `models/${name}.sql`, parts: ['orders-daily', 'customer-ltv', 'churn-flags', 'product-margin', 'store-footfall', 'returns-rate', 'basket-size', 'promo-uplift', 'stock-aging', 'supplier-lead', 'region-sales', 'web-sessions', 'cohort-retention', 'refund-reasons', 'loyalty-points', 'price-history', 'delivery-sla', 'cart-abandon', 'gift-cards', 'staff-hours'] },
} satisfies Record<FreshProjectName, FreshProject>;

const f = (k: string, s: Section, at: number, t: string, more: Partial<Pick<FreshDraft, 'why' | 'ref' | 'closed'>> = {}): FreshDraft => ({ k, s, at, t, ...more });

const merge = (id: string, into: string): TrapOp => ({ op: 'close', id, why: 'merged', into });
const closeDone = (id: string): TrapOp => ({ op: 'close', id, why: 'done' });
const closeAnswered = (id: string): TrapOp => ({ op: 'close', id, why: 'answered' });

export const FRESH_PLANS: readonly FreshPlan[] = [
    {
        id: 'fcs-01-closebait-near-small', project: 'driftwood', name: 'Offline photo upload', language: 'en', plants: ['close-bait', 'near-pair'], size: 'small', span: 110, total: 7,
        core: [
            f('goal', 'goal', 0, 'Let inspectors attach photos to a report while the tablet has no signal and send them later'),
            f('queue', 'done', 18, 'Photos taken offline are stored in the upload queue with the report number and the capture time', { ref: 'app/screens/offline-queue.tsx' }),
            f('dec', 'decisions', 30, 'Resize photos to 2048 pixels on the long edge before they enter the queue', { why: 'full-size photos filled the 16 GB tablets after two days of site visits' }),
            f('bait', 'next', 40, 'Show a badge with the number of queued photos on the sync banner'),
            f('wifi', 'done', 55, 'Tested the photo upload on Wi-Fi: 40 photos sent in 3 minutes'),
            f('cell', 'done', 64, 'Tested the photo upload on mobile data: 40 photos sent in 11 minutes'),
            f('badge', 'done', 72, 'The sync banner now shows a badge with the count of queued photos and clears it after the upload', { ref: 'app/screens/sync-banner.tsx' }),
        ],
        near: [['wifi', 'cell']],
        traps: [
            { kind: 'close-bait', ops: [closeDone('bait')], expect: 'refused' },
            { kind: 'near-pair', ops: [merge('cell', 'wifi')], expect: 'kept' },
        ],
    },
    {
        id: 'fcs-02-closebait-waiting-small', project: 'ironbark', name: 'Overtime approval reminders', language: 'en', plants: ['close-bait', 'waiting-on-operator'], size: 'small', span: 130, total: 6,
        core: [
            f('goal', 'goal', 0, 'Remind team leads by e-mail when an overtime request has waited more than two working days'),
            f('job', 'done', 20, 'A nightly job lists the overtime requests that have waited more than two working days', { ref: 'services/approvals/reminder_job.go' }),
            f('bait', 'now', 35, 'Writing the reminder e-mail template for team leads'),
            f('tpl', 'done', 60, 'The reminder e-mail template for team leads is written and reviewed; it links to the approval page', { ref: 'templates/overtime_reminder.html' }),
            f('hol', 'needs', 70, 'Operator must say whether public holidays count as working days for the two-day limit'),
            f('next', 'next', 85, 'Send the first reminders to the payroll pilot group'),
        ],
        waiting: { keys: ['hol'], gist: 'the operator has to say whether public holidays count as working days for the two-day reminder limit' },
        traps: [
            { kind: 'close-bait', ops: [closeDone('bait')], expect: 'refused' },
        ],
    },
    {
        id: 'fcs-03-closebait-verbatim-medium', project: 'marigold', name: 'Event list time zones', language: 'en', plants: ['close-bait', 'verbatim-copy'], size: 'medium', span: 300, total: 18,
        core: [
            f('goal', 'goal', 0, 'Show every event on the event list in the time zone of its venue, with the zone name next to the time'),
            f('rule', 'rules', 2, 'A page renders the same for every visitor; no time zone is taken from the browser'),
            f('dec', 'decisions', 15, 'Store event times in UTC with the IANA zone of the venue beside them', { why: 'two venues changed their offset for summer time in the middle of a festival week' }),
            f('conv', 'done', 30, 'The event list template converts each start time to the venue zone at build time', { ref: 'themes/marigold/event-list.html' }),
            f('bait', 'next', 40, 'Print the zone abbreviation, such as CET or EST, after each event time'),
            f('abbr', 'done', 66, 'Every event time on the event list now ends with the zone abbreviation of its venue'),
            f('now', 'now', 88, 'Checking the 12 events that cross a summer time change'),
            f('next', 'next', 90, 'Add the venue zone to the calendar file that the Add to calendar button downloads'),
        ],
        copies: [{ of: 'conv', k: 'conv2', at: 78 }],
        traps: [
            { kind: 'close-bait', ops: [closeDone('bait')], expect: 'refused' },
            { kind: 'verbatim-copy', ops: [merge('conv2', 'conv'), merge('conv', 'conv2')], expect: 'refused' },
        ],
    },
    {
        id: 'fcs-04-closebait-closed-medium-es', project: 'pinecrest', name: 'Tiempos de espera del proxy de borde', language: 'es', plants: ['close-bait', 'closed-tempting', 'language-es'], size: 'medium', span: 360, total: 20,
        core: [
            f('goal', 'goal', 0, 'Evitar que el proxy de borde corte las descargas largas de informes a los 60 segundos'),
            f('old', 'decisions', 8, 'Subir el tiempo de espera de lectura del proxy a 300 segundos en todas las rutas', { why: 'era el cambio más pequeño que arreglaba las descargas de informes', closed: ['superseded', 34] }),
            f('route', 'decisions', 34, 'Subir el tiempo de espera de lectura a 300 segundos solo en la ruta /reports; las demás rutas siguen con 60 segundos', { why: 'con 300 segundos para todo, las llamadas atascadas al upstream retenían 4 veces más conexiones en la prueba de carga' }),
            f('cfg', 'done', 45, 'El chart edge-proxy fija un tiempo de espera de lectura de 300 segundos solo en /reports', { ref: 'charts/edge-proxy/values.yaml' }),
            f('bait', 'next', 52, 'Desplegar el cambio de tiempo de espera del proxy de borde en el clúster de staging'),
            f('stg', 'done', 70, 'El cambio de tiempo de espera del proxy de borde ya corre en el clúster de staging; allí terminó una descarga de informe de 4 minutos'),
            f('now', 'now', 90, 'Vigilando durante un día el número de conexiones del proxy de borde en staging'),
            f('next', 'next', 92, 'Pedir una ventana de producción para el cambio del proxy de borde'),
        ],
        closed: [{ k: 'old', must_not_say: 'que todas las rutas del proxy de borde tienen un tiempo de espera de lectura de 300 segundos', current: 'route' }],
        traps: [
            { kind: 'close-bait', ops: [closeDone('bait')], expect: 'refused' },
            { kind: 'closed-tempting', ops: [merge('old', 'route')], expect: 'refused' },
        ],
    },
    {
        id: 'fcs-05-closebait-near-waiting-large', project: 'sparrowgate', name: 'Plugin host sandbox', language: 'en', plants: ['close-bait', 'near-pair', 'waiting-on-operator'], size: 'large', span: 3200, total: 56,
        core: [
            f('goal', 'goal', 0, 'Run third-party formatter plugins in a sandbox that cannot read files outside the project'),
            f('rule', 'rules', 1, 'A plugin never gets network access unless the user grants it in the config file'),
            f('notes', 'links', 3, 'Sandbox design notes', { ref: 'docs/design/plugin-sandbox.md' }),
            f('dec', 'decisions', 12, 'Run each plugin in a worker thread with a frozen copy of the file system API', { why: 'a separate process per plugin added 180 ms to every format call' }),
            f('fs', 'done', 25, 'The plugin host refuses a read outside the project root with the error code PLUGIN_FS_DENIED', { ref: 'packages/plugin-host/src/fs-guard.ts' }),
            f('bait', 'next', 33, 'Write the migration note for plugin authors about the new file access rules'),
            f('mac', 'done', 47, 'The sandbox test suite passes on macOS: 31 of 31 cases'),
            f('win', 'done', 52, 'The sandbox test suite passes on Windows: 29 of 31 cases, the two symlink cases are skipped'),
            f('note', 'done', 58, 'The migration note for plugin authors is published and explains the new file access rules', { ref: 'docs/plugins/migration-3.md' }),
            f('net', 'needs', 80, 'Operator must decide whether the official plugins may keep network access without asking the user'),
            f('now', 'now', 95, 'Measuring the start-up time of the sandbox with 12 plugins loaded'),
            f('next', 'next', 96, 'Publish a beta of the plugin host with the sandbox turned on by default'),
        ],
        near: [['mac', 'win']],
        waiting: { keys: ['net'], gist: 'the operator has to decide whether the official plugins may keep network access without asking the user' },
        traps: [
            { kind: 'close-bait', ops: [closeDone('bait')], expect: 'refused' },
            { kind: 'near-pair', ops: [merge('win', 'mac')], expect: 'kept' },
        ],
    },
    {
        id: 'fcs-06-closedmerge-json-small', project: 'cobblestone', name: 'Basket size model checks', language: 'en', plants: ['closed-merge-bait', 'json-in-fact'], size: 'small', span: 140, total: 7,
        core: [
            f('goal', 'goal', 0, 'Make the nightly basket-size model fail loudly when its source table arrives empty'),
            f('rerun', 'next', 10, 'Rerun the basket-size model against the full March partition', { closed: ['done', 30] }),
            f('chk', 'done', 24, 'The model run now stops with a row-count check when the source has zero rows', { ref: 'models/basket-size.sql' }),
            f('json', 'done', 40, 'When it stops, the check posts {"model": "basket-size", "rows": 0} to the alert channel'),
            f('dec', 'decisions', 50, 'Treat fewer than 100 rows as an empty source as well', { why: 'a half-loaded partition once held 12 rows and passed the old check' }),
            f('rerun2', 'next', 75, 'Rerun the basket-size model against the full March partition'),
            f('now', 'now', 85, 'Reading the alert channel output of last night'),
        ],
        traps: [
            { kind: 'closed-merge-bait', ops: [merge('rerun', 'rerun2')], expect: 'refused' },
        ],
    },
    {
        id: 'fcs-07-closedmerge-near-small', project: 'pinecrest', name: 'Trace collector sampling', language: 'en', plants: ['closed-merge-bait', 'near-pair'], size: 'small', span: 120, total: 7,
        core: [
            f('goal', 'goal', 0, 'Cut the storage used by traces in half without losing the traces of failed requests'),
            f('check', 'now', 12, 'Checking the trace volume per service on the collector dashboard', { closed: ['superseded', 40] }),
            f('dec', 'decisions', 30, 'Keep every trace with an error status and sample 10 % of the rest', { why: 'the failed requests are the traces people open during an incident' }),
            f('stg', 'done', 48, 'The new sampling rule runs on the trace collector in the staging cluster'),
            f('prod', 'done', 62, 'The new sampling rule runs on the trace collector in the production cluster'),
            f('check2', 'now', 80, 'Checking the trace volume per service on the collector dashboard'),
            f('next', 'next', 90, 'Lower the retention of sampled traces from 14 to 7 days'),
        ],
        near: [['stg', 'prod']],
        traps: [
            { kind: 'closed-merge-bait', ops: [merge('check', 'check2')], expect: 'refused' },
            { kind: 'near-pair', ops: [merge('prod', 'stg')], expect: 'kept' },
        ],
    },
    {
        id: 'fcs-08-closedmerge-closed-waiting-medium', project: 'ironbark', name: 'Bank export file format', language: 'en', plants: ['closed-merge-bait', 'closed-tempting', 'waiting-on-operator'], size: 'medium', span: 420, total: 22,
        core: [
            f('goal', 'goal', 0, 'Produce the weekly bank export in the format the new bank requires from January'),
            f('spec', 'links', 2, 'Bank file specification 4.1', { ref: 'docs/bank/spec-4.1.pdf' }),
            f('fmt', 'done', 15, 'The bank export writes fixed-width records of 240 characters', { closed: ['wrong', 32] }),
            f('val', 'next', 20, 'Validate a sample export against the test portal of the bank', { closed: ['done', 40] }),
            f('xml', 'done', 33, 'The bank export writes the payment XML of specification 4.1; the fixed-width writer is removed', { ref: 'services/bank-export/handler.go' }),
            f('dec', 'decisions', 42, 'Group payments by pay date, one file per date', { why: 'the bank rejects a file that mixes value dates' }),
            f('val2', 'next', 70, 'Validate a sample export against the test portal of the bank'),
            f('cut', 'needs', 78, 'Operator must say which cut-off time the bank gave for the Friday file: 14:00 or 16:00'),
            f('now', 'now', 92, 'Writing the reconciliation report that compares the export totals with the pay run'),
        ],
        waiting: { keys: ['cut'], gist: 'the operator has to say which cut-off time the bank gave for the Friday file (14:00 or 16:00)' },
        closed: [{ k: 'fmt', must_not_say: 'that the bank export writes fixed-width records of 240 characters', current: 'xml' }],
        traps: [
            { kind: 'closed-merge-bait', ops: [merge('val', 'val2')], expect: 'refused' },
            { kind: 'closed-tempting', ops: [merge('fmt', 'xml')], expect: 'refused' },
        ],
    },
    {
        id: 'fcs-09-closedmerge-verbatim-medium', project: 'sparrowgate', name: 'Watch mode on network drives', language: 'en', plants: ['closed-merge-bait', 'verbatim-copy'], size: 'medium', span: 480, total: 24,
        core: [
            f('goal', 'goal', 0, 'Make watch mode notice file changes on network drives within two seconds'),
            f('poll', 'now', 8, 'Profiling the polling fallback of watch mode on a mounted share', { closed: ['superseded', 30] }),
            f('dec', 'decisions', 20, 'Fall back to polling every 1500 ms when the file system sends no change events', { why: 'the mounted shares in the test lab never sent a single change event' }),
            f('det', 'done', 35, 'Watch mode detects a network drive by its mount type and switches to polling', { ref: 'packages/watch-mode/src/detect.ts' }),
            f('cpu', 'done', 50, 'Polling 20000 files every 1500 ms costs 3 % of one core on the lab machine'),
            f('poll2', 'now', 85, 'Profiling the polling fallback of watch mode on a mounted share'),
            f('next', 'next', 90, 'Add a --poll-interval flag for users with very large trees'),
        ],
        copies: [{ of: 'det', k: 'det2', at: 72 }],
        traps: [
            { kind: 'closed-merge-bait', ops: [merge('poll', 'poll2')], expect: 'refused' },
            { kind: 'verbatim-copy', ops: [merge('det2', 'det'), merge('det', 'det2')], expect: 'refused' },
        ],
    },
    {
        id: 'fcs-10-closedmerge-near-closed-large', project: 'driftwood', name: 'Signature capture on reports', language: 'en', plants: ['closed-merge-bait', 'near-pair', 'closed-tempting'], size: 'large', span: 3000, total: 48,
        core: [
            f('goal', 'goal', 0, 'Let the site owner sign the inspection report on the tablet before the inspector leaves'),
            f('rule', 'rules', 1, 'A signed report is never edited; a change creates a new revision'),
            f('png', 'decisions', 6, 'Store the signature as a PNG image inside the report', { why: 'the report viewer already shows images', closed: ['superseded', 24] }),
            f('vec', 'decisions', 24, 'Store the signature as vector strokes together with a hash of the report it signs', { why: 'a PNG could be copied onto another report without leaving any trace' }),
            f('pad', 'done', 32, 'The signature pad records strokes with pressure and time', { ref: 'app/screens/signature-pad.tsx' }),
            f('sync', 'next', 38, 'Run the sync test with a signed report on a tablet in flight mode', { closed: ['done', 55] }),
            f('ten', 'done', 48, 'The signature pad works on the 10 inch tablets in landscape'),
            f('eight', 'done', 60, 'The signature pad works on the 8 inch tablets in portrait only'),
            f('lock', 'done', 66, 'A report locks itself as soon as the signature is saved'),
            f('sync2', 'next', 80, 'Run the sync test with a signed report on a tablet in flight mode'),
            f('now', 'now', 94, 'Building the revision view that shows which revision the owner signed'),
            f('next', 'next', 95, 'Print the signature hash in the footer of the PDF report'),
        ],
        near: [['ten', 'eight']],
        closed: [{ k: 'png', must_not_say: 'that the signature is stored as a PNG image inside the report', current: 'vec' }],
        traps: [
            { kind: 'closed-merge-bait', ops: [merge('sync', 'sync2')], expect: 'refused' },
            { kind: 'near-pair', ops: [merge('eight', 'ten')], expect: 'kept' },
            { kind: 'closed-tempting', ops: [merge('png', 'vec')], expect: 'refused' },
        ],
    },
    {
        id: 'fcs-11-chain-small', project: 'marigold', name: 'Newsletter form spam', language: 'en', plants: ['chain-bait', 'verbatim-copy'], size: 'small', span: 150, total: 7,
        core: [
            f('goal', 'goal', 0, 'Stop bots from filling in the newsletter form without adding a puzzle for people'),
            f('dec', 'decisions', 14, 'Use a hidden honeypot field instead of a captcha', { why: 'the captcha halved the sign-ups in the last test' }),
            f('a', 'done', 30, 'The newsletter form now has spam protection'),
            f('b', 'done', 46, 'The newsletter form rejects a submission when the hidden honeypot field is filled or when it arrives less than 3 seconds after the page loaded', { ref: 'themes/marigold/newsletter-form.html' }),
            f('now', 'now', 80, 'Reading the form logs of the last weekend'),
            f('next', 'next', 88, 'Count the rejected submissions for one week and compare them with the sign-ups'),
        ],
        copies: [{ of: 'b', k: 'c', at: 70 }],
        reworded: [{ weak: 'a', keep: 'b' }],
        traps: [
            { kind: 'chain-bait', ops: [merge('a', 'b'), merge('b', 'c')], expect: 'refused' },
        ],
    },
    {
        id: 'fcs-12-chain-waiting-medium', project: 'cobblestone', name: 'Customer lifetime value refresh', language: 'en', plants: ['chain-bait', 'verbatim-copy', 'waiting-on-operator'], size: 'medium', span: 400, total: 20,
        core: [
            f('goal', 'goal', 0, 'Refresh the customer lifetime value model daily instead of weekly'),
            f('dec', 'decisions', 10, 'Build the model incrementally from the orders of the last day', { why: 'a full rebuild takes 3 hours and the warehouse slot is 1 hour' }),
            f('a', 'done', 28, 'The lifetime value model is incremental now'),
            f('b', 'done', 44, 'The lifetime value model adds only the orders of the previous day and merges them by customer id; a run takes 9 minutes', { ref: 'models/customer-ltv.sql' }),
            f('hist', 'needs', 72, 'Operator must say whether refunds older than 90 days still change the lifetime value of a customer'),
            f('now', 'now', 88, 'Comparing a week of incremental runs with one full rebuild'),
            f('next', 'next', 90, 'Move the model from the weekly schedule to the daily one'),
        ],
        copies: [{ of: 'b', k: 'c', at: 66 }],
        reworded: [{ weak: 'a', keep: 'b' }],
        waiting: { keys: ['hist'], gist: 'the operator has to say whether refunds older than 90 days still change the lifetime value of a customer' },
        traps: [
            { kind: 'chain-bait', ops: [merge('a', 'b'), merge('b', 'c')], expect: 'refused' },
            { kind: 'waiting-on-operator', ops: [closeAnswered('hist')], expect: 'refused' },
        ],
    },
    {
        id: 'fcs-13-chain-near-medium', project: 'ironbark', name: 'Leave balance rounding', language: 'en', plants: ['chain-bait', 'verbatim-copy', 'near-pair'], size: 'medium', span: 450, total: 22,
        core: [
            f('goal', 'goal', 0, 'Show leave balances in half days everywhere, as the new contract templates require'),
            f('dec', 'decisions', 12, 'Round leave balances down to the nearest half day', { why: 'rounding up would grant leave that nobody earned' }),
            f('a', 'done', 26, 'Leave balance rounding is fixed'),
            f('b', 'done', 40, 'Leave balances are rounded down to the nearest half day in the API and on the payslip', { ref: 'services/leave-balance/handler.go' }),
            f('ft', 'done', 50, 'Checked the rounding against 25 full-time contracts: no difference from the hand calculation'),
            f('pt', 'done', 56, 'Checked the rounding against 25 part-time contracts: 2 differ from the hand calculation'),
            f('now', 'now', 88, 'Looking into the 2 part-time contracts that differ'),
            f('next', 'next', 90, 'Tell the team leads that balances now show half days'),
        ],
        copies: [{ of: 'b', k: 'c', at: 62 }],
        reworded: [{ weak: 'a', keep: 'b' }],
        near: [['ft', 'pt']],
        traps: [
            { kind: 'chain-bait', ops: [merge('a', 'b'), merge('b', 'c')], expect: 'refused' },
            { kind: 'near-pair', ops: [merge('pt', 'ft')], expect: 'kept' },
        ],
    },
    {
        id: 'fcs-14-chain-closed-large', project: 'pinecrest', name: 'Canary rollouts for the job scheduler', language: 'en', plants: ['chain-bait', 'verbatim-copy', 'closed-tempting'], size: 'large', span: 4000, total: 64,
        core: [
            f('goal', 'goal', 0, 'Roll out new job-scheduler versions to 5 % of the nodes first and stop on errors'),
            f('rule', 'rules', 1, 'A rollout never runs during the nightly billing jobs between 01:00 and 03:00 UTC'),
            f('manual', 'decisions', 7, 'Promote a canary by hand after looking at the dashboard', { why: 'it needed no new tooling', closed: ['superseded', 26] }),
            f('auto', 'decisions', 26, 'Promote a canary automatically when its error rate stays under 0.5 % for 30 minutes', { why: 'the hand promotions waited up to 9 hours for someone to look' }),
            f('a', 'done', 38, 'The canary controller can now stop a rollout'),
            f('b', 'done', 52, 'The canary controller stops a rollout and rolls the canary nodes back when their error rate passes 0.5 % for 5 minutes', { ref: 'charts/canary-controller/values.yaml' }),
            f('all', 'done', 60, 'Every scheduler node runs version 2.8', { closed: ['wrong', 66] }),
            f('part', 'done', 67, '19 of 20 scheduler nodes run version 2.8; node 7 was rolled back by the canary controller'),
            f('now', 'now', 95, 'Reading the logs of node 7 to see why its error rate rose'),
            f('next', 'next', 96, 'Add the rollout state to the alerts of the pager bridge'),
        ],
        copies: [{ of: 'b', k: 'c', at: 74 }],
        reworded: [{ weak: 'a', keep: 'b' }],
        closed: [
            { k: 'manual', must_not_say: 'that a canary is promoted by hand after someone looks at the dashboard', current: 'auto' },
            { k: 'all', must_not_say: 'that every scheduler node runs version 2.8', current: 'part' },
        ],
        traps: [
            { kind: 'chain-bait', ops: [merge('a', 'b'), merge('b', 'c')], expect: 'refused' },
            { kind: 'closed-tempting', ops: [merge('all', 'part')], expect: 'refused' },
        ],
    },
    {
        id: 'fcs-15-longpressure-waiting-small', project: 'sparrowgate', name: 'Diagnostics output for editors', language: 'en', plants: ['long-pressure', 'waiting-on-operator'], size: 'small', span: 200, total: 7,
        core: [
            f('goal', 'goal', 0, 'Give editors one stable JSON format for the diagnostics of the linter, so that the language server, the command line and the CI annotations all show the same message, the same range and the same fix suggestion for every finding'),
            f('code', 'decisions', 12, 'Number every diagnostic with a stable code such as SG1042 and never reuse a retired code, even when a rule is deleted or split into two rules with a narrower scope', { why: 'editors and CI dashboards group findings by code, and a reused code once merged two unrelated rules in the history of a team' }),
            f('range', 'decisions', 25, 'Report ranges as zero-based line and UTF-16 column pairs, the same as the language server protocol, and convert them to one-based numbers only when printing for people on the command line', { why: 'three editors placed the squiggle one character off on lines with emoji when the ranges were byte offsets' }),
            f('schema', 'done', 40, 'Wrote the JSON schema of the diagnostics format', { ref: 'packages/diagnostics/schema.json' }),
            f('now', 'now', 60, 'Rewriting the command line printer so that it reads the same diagnostic objects as the language server bridge, instead of building its own strings from the rule results, which today gives a different wording for 14 rules'),
            f('fix', 'needs', 75, 'Operator must decide whether fix suggestions that change more than one file may be applied by the editors automatically, or whether they always need a confirmation from the person before anything is written'),
            f('next', 'next', 85, 'Publish the diagnostics format as version 1 in the docs'),
        ],
        waiting: { keys: ['fix'], gist: 'the operator has to decide whether fix suggestions that change more than one file may be applied without a confirmation' },
        traps: [
            { kind: 'waiting-on-operator', ops: [closeAnswered('fix')], expect: 'refused' },
        ],
    },
    {
        id: 'fcs-16-longpressure-near-medium', project: 'driftwood', name: 'Crew list for shared jobs', language: 'en', plants: ['long-pressure', 'near-pair', 'verbatim-copy'], size: 'medium', span: 380, total: 20,
        core: [
            f('goal', 'goal', 0, 'Let several inspectors work on one large site job at the same time, each with their own checklist sections, while the lead inspector sees the progress of the whole crew and signs the final report alone, once every section shows as synced on the tablet of the lead'),
            f('assign', 'decisions', 15, 'Assign checklist sections to inspectors instead of single items, and let only the lead inspector move a section from one inspector to another during the visit', { why: 'item-level assignment made the crew list unreadable on jobs with more than 300 items' }),
            f('sign', 'decisions', 30, 'Keep the final signature with the lead inspector only, even when every section of the job was filled in by other members of the crew', { why: 'the inspection company signs as one party and the lead is the person named in the contract' }),
            f('two', 'done', 40, 'Tested a shared job with 2 inspectors on one site: every section synced once'),
            f('srv', 'done', 45, 'The server stores the section assignment of each inspector per job'),
            f('n1', 'now', 50, 'Building the crew list screen that shows each inspector of the job with the checklist sections assigned to them, the number of open items in those sections and the time of their last sync with the server, so that the lead sees at a glance who is behind'),
            f('four', 'done', 58, 'Tested a shared job with 4 inspectors on one site: 1 section synced twice'),
            f('n2', 'now', 70, 'Reworking the conflict rule for two inspectors who edit the same checklist item while both tablets are offline, so that the later edit wins but the earlier one stays visible in the history of the item'),
            f('next', 'next', 90, 'Fix the double sync of one section seen in the test with 4 inspectors'),
        ],
        copies: [{ of: 'srv', k: 'srv2', at: 76 }],
        near: [['two', 'four']],
        traps: [
            { kind: 'verbatim-copy', ops: [merge('srv2', 'srv'), merge('srv', 'srv2')], expect: 'refused' },
            { kind: 'near-pair', ops: [merge('four', 'two')], expect: 'kept' },
        ],
    },
    {
        id: 'fcs-17-longpressure-closed-medium-es', project: 'marigold', name: 'Tabla de precios con planes anuales', language: 'es', plants: ['long-pressure', 'closed-tempting', 'language-es'], size: 'medium', span: 330, total: 18,
        core: [
            f('goal', 'goal', 0, 'Añadir planes anuales a la tabla de precios para que cada plan muestre un precio mensual y un precio anual con el ahorro en porcentaje, y que el visitante pueda cambiar entre las dos vistas sin que la página dé saltos'),
            f('old', 'decisions', 8, 'Mostrar solo el precio anual y ocultar el mensual', { why: 'marketing quería el número más bajo en la página', closed: ['superseded', 30] }),
            f('both', 'decisions', 30, 'Mostrar por defecto el precio mensual y dejar el precio anual detrás de un interruptor encima de la tabla, y recordar la elección del visitante solo durante la visita actual', { why: 'el equipo de ventas contó que los clientes se sentían engañados cuando el precio mensual estaba oculto' }),
            f('round', 'decisions', 40, 'Redondear hacia abajo cada ahorro anual a un porcentaje entero y no mostrar nunca un ahorro inferior al 5 por ciento, para que la tabla no anuncie un descuento que al redondear se queda en casi nada, ni siquiera en el plan más barato', { why: 'finanzas no quiere en la página un ahorro que la factura no pueda mostrar' }),
            f('sw', 'done', 50, 'El interruptor encima de la tabla de precios cambia todos los precios sin que se mueva el diseño', { ref: 'themes/marigold/pricing-grid.html' }),
            f('copy', 'now', 80, 'Redactando con el equipo legal los textos de los planes anuales, incluidas las condiciones de renovación, el plazo de reembolso de 14 días y la frase que explica qué pasa con los meses no usados tras bajar a un plan más pequeño'),
            f('phone', 'now', 85, 'Revisando la tabla en teléfonos estrechos, donde los cuatro planes se apilan en una sola columna y el interruptor tiene que seguir visible mientras el visitante pasa por los dos primeros planes, y la etiqueta de ahorro no debe tapar el precio'),
            f('next', 'next', 90, 'Mostrar los planes anuales al 10 % de los visitantes durante dos semanas'),
        ],
        closed: [{ k: 'old', must_not_say: 'que la tabla de precios muestra solo el precio anual y oculta el mensual', current: 'both' }],
        traps: [
            { kind: 'closed-tempting', ops: [merge('old', 'both')], expect: 'refused' },
        ],
    },
    {
        id: 'fcs-18-longpressure-waiting-json-medium', project: 'pinecrest', name: 'Policy engine dry runs', language: 'en', plants: ['long-pressure', 'waiting-on-operator', 'json-in-fact'], size: 'medium', span: 420, total: 22,
        core: [
            f('goal', 'goal', 0, 'Let teams run a new admission policy in dry-run mode for a week, see every request it would have denied, and switch it to enforcing only when the list of denials is empty or every denial on it is explained by the owning team'),
            f('log', 'decisions', 14, 'Write dry-run denials to the audit log with a mode field set to dry-run instead of a separate log, so that one query shows both the enforced and the dry-run results of a policy', { why: 'the platform team already builds every dashboard from the audit log' }),
            f('expire', 'decisions', 28, 'Let a dry-run policy expire after 14 days unless someone renews it, and send a reminder to the owning team two days before it expires', { why: 'old dry-run policies piled up and nobody read their denials' }),
            f('chart', 'done', 38, 'The policy-engine chart accepts a mode value per policy', { ref: 'charts/policy-engine/values.yaml' }),
            f('json', 'done', 45, 'A dry-run denial is logged as {"policy": "require-limits", "mode": "dry-run", "allowed": true}'),
            f('now', 'now', 65, 'Building the report that lists, per policy in dry-run mode, the namespaces and workloads it would have denied in the last seven days, grouped by the rule that matched and sorted by count, with a link to the audit log entry of each request'),
            f('own', 'needs', 75, 'Operator must decide which team owns a dry-run policy that was created by a person who has since left the company, since the expiry reminder needs someone to go to'),
            f('next', 'next', 90, 'Run the require-limits policy in dry-run mode on the shared cluster'),
        ],
        waiting: { keys: ['own'], gist: 'the operator has to decide which team owns a dry-run policy whose creator has left the company' },
        traps: [
            { kind: 'waiting-on-operator', ops: [closeAnswered('own')], expect: 'refused' },
        ],
    },
    {
        id: 'fcs-19-longpressure-closed-waiting-medium', project: 'cobblestone', name: 'Delivery SLA dashboard', language: 'en', plants: ['long-pressure', 'closed-tempting', 'waiting-on-operator'], size: 'medium', span: 500, total: 24,
        core: [
            f('goal', 'goal', 0, 'Give the operations team a daily view of late deliveries per region and carrier, with the share of orders that missed the promised date and the main reason for each miss, ready by 07:00 every morning, in a form that the regional managers can read on a phone'),
            f('old', 'decisions', 6, 'Count a delivery as late when it arrives after 18:00 on the promised date', { why: 'it matched the old carrier contracts', closed: ['superseded', 25] }),
            f('slot', 'decisions', 25, 'Count a delivery as late when it arrives after the end of the time slot the customer chose at checkout, and fall back to 18:00 only for orders without a slot', { why: 'since slot booking went live, half of the orders promise a two-hour window' }),
            f('model', 'done', 40, 'The delivery SLA model joins orders, slots and carrier scans per day', { ref: 'models/delivery-sla.sql' }),
            f('tz', 'decisions', 48, 'Compute every delivery time in the local time of the delivery address, not in the time zone of the warehouse that shipped the order, which matters for the islands as well', { why: 'two warehouses ship across a time zone border and made deliveries look an hour late' }),
            f('now', 'now', 60, 'Mapping the free-text failure notes of the three carriers to six reasons, such as address not found, customer absent and vehicle breakdown, and keeping the original note next to each mapped reason for the weekly review'),
            f('isl', 'needs', 72, 'Operator must say whether the islands count as their own region in the dashboard or stay inside the southern region, because the carriers report them separately and with their own delivery targets'),
            f('next', 'next', 90, 'Schedule the model so that it finishes before 07:00 each morning'),
        ],
        waiting: { keys: ['isl'], gist: 'the operator has to say whether the islands are their own region in the dashboard or part of the southern region' },
        closed: [{ k: 'old', must_not_say: 'that a delivery counts as late only when it arrives after 18:00 on the promised date', current: 'slot' }],
        traps: [
            { kind: 'closed-tempting', ops: [merge('old', 'slot')], expect: 'refused' },
            { kind: 'waiting-on-operator', ops: [closeAnswered('isl')], expect: 'refused' },
        ],
    },
    {
        id: 'fcs-20-longpressure-near-large', project: 'ironbark', name: 'Pay run preview', language: 'en', plants: ['long-pressure', 'verbatim-copy', 'near-pair'], size: 'large', span: 3600, total: 52,
        core: [
            f('goal', 'goal', 0, 'Show payroll staff a full preview of the next pay run three days before it closes, with every change against the previous run explained per employee, so that mistakes are fixed before money leaves the bank'),
            f('rule', 'rules', 1, 'No preview number may differ from the number that the closed pay run later pays'),
            f('same', 'decisions', 10, 'Compute the preview with the same calculation code as the real pay run, in a read-only transaction that is rolled back at the end, instead of a separate estimate, even if this makes the preview slower', { why: 'an estimate drifted from the real run by up to 40 euros per payslip in the trial' }),
            f('explain', 'decisions', 22, 'Explain each change with the rule that caused it, such as a new grade, an overtime claim or a tax code change, and list the unexplained changes at the top of the preview', { why: 'payroll staff only have time to read the changes that nobody can explain' }),
            f('calc', 'done', 32, 'The preview runs the full calculation in a rolled-back transaction', { ref: 'services/pay-runs/preview.go' }),
            f('month', 'done', 44, 'The preview of the monthly pay run finishes in 6 minutes for 4200 employees'),
            f('week', 'done', 50, 'The preview of the weekly pay run finishes in 2 minutes for 900 employees'),
            f('screen', 'now', 85, 'Building the screen that lists the unexplained changes first, with a link from each change to the payslip line, the rule version and the input record that produced it, so that a payroll clerk can fix the cause in one step'),
            f('load', 'now', 90, 'Measuring how much the preview slows down the database while staff still enter timesheets during the last three days before the pay run closes, when most of the input changes arrive at the same time'),
            f('next', 'next', 95, 'Run the preview beside the October pay run and compare every payslip'),
        ],
        copies: [{ of: 'calc', k: 'calc2', at: 70 }],
        near: [['month', 'week']],
        traps: [
            { kind: 'verbatim-copy', ops: [merge('calc2', 'calc'), merge('calc', 'calc2')], expect: 'refused' },
            { kind: 'near-pair', ops: [merge('week', 'month')], expect: 'kept' },
        ],
    },
    {
        id: 'fcs-21-thin-closed-small', project: 'driftwood', name: 'Barcode scan of equipment tags', language: 'en', plants: ['thin-ledger', 'closed-tempting'], size: 'small', span: 160, total: 8,
        core: [
            f('old', 'goal', 0, 'Read the equipment tags with the tablet camera, QR codes only', { closed: ['superseded', 30] }),
            f('lib', 'now', 8, 'Trying the built-in camera barcode reader on the oldest tablet model', { closed: ['superseded', 22] }),
            f('fmt', 'needs', 12, 'Operator must say which barcode formats the equipment tags use', { closed: ['answered', 28] }),
            f('fast', 'done', 20, 'The scanner reads a tag in under one second on every tablet model', { closed: ['wrong', 45] }),
            f('goal', 'goal', 30, 'Read the equipment tags with the tablet camera, both the QR codes and the older Code 128 labels'),
            f('test', 'next', 35, 'Scan 50 real tags from the pilot site', { closed: ['done', 55] }),
            f('slow', 'done', 56, 'Code 128 labels take up to 4 seconds to read on the oldest tablet model; QR codes stay under one second'),
            f('next', 'next', 80, 'Add a manual entry field for labels the camera cannot read'),
        ],
        closed: [
            { k: 'old', must_not_say: 'that only QR codes are read from the equipment tags', current: 'goal' },
            { k: 'fmt', must_not_say: 'that the barcode formats of the equipment tags still wait on the operator', current: 'goal' },
            { k: 'fast', must_not_say: 'that every tag reads in under one second on every tablet model', current: 'slow' },
        ],
        traps: [
            { kind: 'closed-tempting', ops: [merge('fast', 'slow')], expect: 'refused' },
        ],
    },
    {
        id: 'fcs-22-thin-closed-waiting-small', project: 'sparrowgate', name: 'Update check opt-out', language: 'en', plants: ['thin-ledger', 'closed-tempting', 'waiting-on-operator'], size: 'small', span: 170, total: 9,
        core: [
            f('r1', 'now', 4, 'Reading how the update check contacts the release server', { closed: ['superseded', 15] }),
            f('env', 'decisions', 10, 'Turn the update check off with the environment variable SPARROW_NO_UPDATE', { why: 'it is the quickest switch for CI machines', closed: ['superseded', 40] }),
            f('ci', 'next', 18, 'Turn the update check off by itself when the CI variable is set', { closed: ['done', 35] }),
            f('q', 'needs', 22, 'Operator must say whether the update check may send the installed version number', { closed: ['answered', 38] }),
            f('week', 'done', 28, 'The update check runs at most once a week per machine', { closed: ['wrong', 50] }),
            f('cfg', 'decisions', 40, 'Turn the update check off with the setting updateCheck: false in the config file, and keep the environment variable only as an alias', { why: 'teams wanted the choice in the repository, not in each shell' }),
            f('r2', 'now', 44, 'Writing the opt-out section of the config reference', { closed: ['done', 60] }),
            f('day', 'done', 52, 'The update check runs at most once a day per machine; the weekly limit was never wired in'),
            f('tel', 'needs', 70, 'Operator must decide whether the opt-out also turns off the anonymous crash reports'),
        ],
        waiting: { keys: ['tel'], gist: 'the operator has to decide whether the opt-out also turns off the anonymous crash reports' },
        closed: [
            { k: 'env', must_not_say: 'that the update check is turned off only with the environment variable SPARROW_NO_UPDATE', current: 'cfg' },
            { k: 'q', must_not_say: 'that sending the installed version number still waits on the operator', current: null },
            { k: 'week', must_not_say: 'that the update check runs at most once a week per machine', current: 'day' },
        ],
        traps: [
            { kind: 'closed-tempting', ops: [merge('env', 'cfg')], expect: 'refused' },
            { kind: 'waiting-on-operator', ops: [closeAnswered('tel')], expect: 'refused' },
        ],
    },
    {
        id: 'fcs-23-thin-closed-small', project: 'cobblestone', name: 'Gift card balance model', language: 'en', plants: ['thin-ledger', 'closed-tempting'], size: 'small', span: 150, total: 8,
        core: [
            f('goal', 'goal', 0, 'Report the outstanding balance of all gift cards at the end of each month for finance'),
            f('r', 'now', 6, 'Reading the gift card tables of the shop database', { closed: ['superseded', 18] }),
            f('sum', 'decisions', 14, 'Compute the balance as issued value minus redeemed value', { why: 'it needs only two tables', closed: ['superseded', 40] }),
            f('load', 'next', 20, 'Load the gift card tables into the warehouse', { closed: ['done', 34] }),
            f('match', 'done', 36, 'The balance matches the figure finance reported for September', { closed: ['wrong', 52] }),
            f('exp', 'decisions', 40, 'Compute the balance as issued value minus redeemed value minus the value of expired cards', { why: 'cards expire after three years and finance writes them off' }),
            f('cmp', 'now', 44, 'Comparing the September balance with the finance figure', { closed: ['done', 54] }),
            f('gap', 'done', 55, 'The September balance is 1840 euros above the finance figure; the expired cards of the last quarter are not subtracted yet'),
        ],
        closed: [
            { k: 'sum', must_not_say: 'that the balance is issued value minus redeemed value, as the current rule', current: 'exp' },
            { k: 'match', must_not_say: 'that the balance matches the September figure of finance', current: 'gap' },
        ],
        traps: [
            { kind: 'closed-tempting', ops: [merge('match', 'gap')], expect: 'refused' },
        ],
    },
    {
        id: 'fcs-24-thin-closed-medium', project: 'marigold', name: 'Careers board filters', language: 'en', plants: ['thin-ledger', 'closed-tempting'], size: 'medium', span: 300, total: 14,
        core: [
            f('goal', 'goal', 0, 'Let visitors filter the careers board by country, city and remote work'),
            f('c1', 'now', 3, 'Reading the job feed that the careers board imports', { closed: ['superseded', 10] }),
            f('c2', 'next', 8, 'Ask the recruiting team for the list of office locations', { closed: ['done', 20] }),
            f('c3', 'decisions', 12, 'Filter jobs by city with one drop-down list', { why: 'it was the first idea in the brief', closed: ['superseded', 35] }),
            f('c4', 'now', 18, 'Building the city drop-down for the careers board', { closed: ['superseded', 35] }),
            f('c5', 'needs', 22, 'Operator must say whether remote jobs get their own filter', { closed: ['answered', 40] }),
            f('c6', 'next', 28, 'Map the location codes of the job feed to city names', { closed: ['done', 45] }),
            f('c7', 'decisions', 35, 'Filter jobs by country first and then by city', { why: 'the drop-down of 64 cities was too long on a phone' }),
            f('c8', 'now', 42, 'Writing the remote work filter', { closed: ['done', 60] }),
            f('c9', 'done', 50, 'The country and city filters work on every phone in the test list', { closed: ['wrong', 70] }),
            f('c10', 'next', 55, 'Show the filters to the recruiting team', { closed: ['done', 72] }),
            f('c11', 'now', 62, 'Sorting the countries of the country filter by name instead of by feed code', { closed: ['done', 85] }),
            f('c12', 'next', 75, 'Add the filters to the careers board on the staging site', { closed: ['done', 88] }),
            f('now', 'now', 92, 'Checking the filters with a screen reader before the release'),
        ],
        closed: [
            { k: 'c3', must_not_say: 'that jobs are filtered by city with one drop-down list', current: 'c7' },
            { k: 'c5', must_not_say: 'that a filter for remote jobs still waits on the operator', current: 'goal' },
            { k: 'c9', must_not_say: 'that the country and city filters work on every phone in the test list', current: null },
        ],
        traps: [
            { kind: 'closed-tempting', ops: [merge('c3', 'c7')], expect: 'refused' },
        ],
    },
];
