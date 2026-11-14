export type Section = 'goal' | 'now' | 'needs' | 'done' | 'decisions' | 'next' | 'links' | 'rules';
export type ClosedWhy = 'done' | 'wrong' | 'superseded' | 'answered' | 'merged' | 'rewritten';
export type When = 'old' | 'recent' | 'settled' | 'closed';

export interface Extra {
    readonly key: string;
    readonly s: Section;
    readonly t: string;
    readonly why?: string;
    readonly q?: boolean;
    readonly when: When;
    readonly closedWhy?: ClosedWhy;
}

export interface Turn {
    readonly r: 'user' | 'agent' | 'tool';
    readonly x: string;
    readonly kind?: 'shell' | 'edit' | 'web' | 'agent' | 'other' | 'read';
    readonly what?: string;
}

export interface Bait {
    readonly about: string;
    readonly invented: readonly string[];
}

export interface ItemSpec {
    readonly id: string;
    readonly project: string;
    readonly size: 'small' | 'medium' | 'large';
    readonly plants: readonly string[];
    readonly total: number;
    readonly spanMinutes: number;
    readonly breakShare?: number;
    readonly decisions: readonly number[];
    readonly needs: readonly number[];
    readonly rules: readonly number[];
    readonly exchanges: number;
    readonly note?: string;
    readonly label?: string;
    readonly extra?: readonly Extra[];
    readonly turns?: readonly Turn[];
    readonly plantedReasons?: readonly string[];
    readonly plantedSettled?: readonly string[];
    readonly bait?: readonly Bait[];
    readonly notInOwn?: readonly string[];
    readonly inOwn?: readonly string[];
    readonly gateConflict?: boolean;
}

const all = (count: number): number[] => Array.from({ length: count }, (_, index) => index);

export const ITEMS: readonly ItemSpec[] = [
    { id: 'cb-01', project: 'kestrel', size: 'small', plants: ['plain'], total: 28, spanMinutes: 150, decisions: [0, 2], needs: [0, 1], rules: [0, 1], exchanges: 3 },
    { id: 'cb-02', project: 'marlin', size: 'small', plants: ['plain'], total: 34, spanMinutes: 200, decisions: [0, 1, 4], needs: [0, 1], rules: [1], exchanges: 4 },
    { id: 'cb-03', project: 'orchard', size: 'medium', plants: ['plain'], total: 96, spanMinutes: 540, breakShare: 0.5, decisions: [0, 1, 2, 4, 6], needs: [0, 1, 3, 4], rules: [0, 1, 2], exchanges: 11 },
    {
        id: 'cb-04', project: 'quarry', size: 'small', plants: ['plain'], total: 40, spanMinutes: 240, decisions: [0, 1, 3], needs: [0, 1], rules: [0, 2], exchanges: 4,
        note: 'Keep the chunk size decision and the macOS test failure above everything else.',
    },
    {
        id: 'cb-05', project: 'orchard', size: 'large', plants: ['long-ledger'], total: 240, spanMinutes: 2900, breakShare: 0.45, decisions: all(10), needs: all(9), rules: all(5), exchanges: 30,
        extra: [
            { key: 'rate', s: 'decisions', t: 'The rate limit is 20 submits per customer per minute', why: 'the largest wholesale customer peaks at 12 per minute', when: 'recent' },
            { key: 'hash', s: 'decisions', t: 'Log the key hash, never the raw header', why: 'raw keys from one client embedded an email address', when: 'recent' },
            { key: 'commits', s: 'rules', t: 'Commit messages follow the pattern area: imperative summary', when: 'recent' },
            { key: 'body', s: 'decisions', t: 'Stored replay responses are capped at 64 kB of body', why: 'one export endpoint returned 9 MB and filled the keys table in the load test', when: 'recent' },
            { key: 'rollback', s: 'needs', t: 'Operator must decide who owns the rollback if the migration job fails halfway', q: true, when: 'recent' },
            { key: 'panel', s: 'needs', t: 'The dashboard panel for replayed requests still shows zero in staging', when: 'recent' },
        ],
    },
    {
        id: 'cb-06', project: 'lantern', size: 'large', plants: ['long-ledger'], total: 210, spanMinutes: 2400, breakShare: 0.5, decisions: all(10), needs: all(9), rules: all(5), exchanges: 28,
        extra: [
            { key: 'prefix', s: 'decisions', t: 'Class names in the published CSS use the ln- prefix', why: 'an unprefixed .button class clashed with the stylesheet of a client app', when: 'recent' },
            { key: 'safari', s: 'needs', t: 'Operator must say whether Safari 16 stays in the support matrix', q: true, when: 'recent' },
            { key: 'motion', s: 'decisions', t: 'Motion tokens stop at three durations: 100, 200 and 400 ms', why: 'designers used 11 different durations in version 3', when: 'recent' },
            { key: 'density', s: 'decisions', t: 'The data grid keeps its own density tokens', why: 'global density made rows 8 px taller in the reporting app', when: 'recent' },
            { key: 'notes', s: 'needs', t: 'The release notes draft in docs/releases/4.0.md lists the removed Sass files as still supported', when: 'recent' },
            { key: 'legacy', s: 'rules', t: 'Ask before touching anything under packages/legacy', when: 'recent' },
        ],
    },
    {
        id: 'cb-07', project: 'quarry', size: 'large', plants: ['long-ledger', 'reason-easy-to-drop'], total: 300, spanMinutes: 4300, breakShare: 0.35, decisions: all(10), needs: all(9), rules: all(5), exchanges: 34,
        extra: [
            { key: 'atomic', s: 'decisions', t: 'Sidecar writes go through a temporary file and an atomic rename', why: 'a crash in the middle of a write left a half-written sidecar that resumed at a wrong offset', when: 'old' },
            { key: 'windows', s: 'needs', t: 'The Windows build has not run since the rename change in crates/daemon/src/sidecar.rs', when: 'recent' },
            { key: 'size', s: 'decisions', t: 'Resume never trusts a sidecar whose file size differs from the journal entry', why: 'a truncated download was once resumed as if it were the original file', when: 'recent' },
            { key: 'location', s: 'needs', t: 'Operator must say whether v0.9.0 may move the sidecar for existing users', q: true, when: 'recent' },
            { key: 'loglines', s: 'rules', t: 'Keep every log line of the daemon under 200 bytes', when: 'recent' },
        ],
        plantedReasons: ['atomic'],
    },
    {
        id: 'cb-08', project: 'harbor', size: 'large', plants: ['long-ledger', 'settled-reads-open'], total: 270, spanMinutes: 3600, breakShare: 0.4, decisions: all(10), needs: all(9), rules: all(5), exchanges: 32,
        extra: [
            { key: 'restart', s: 'needs', t: 'Operator must decide whether invoice numbers restart every year', q: true, when: 'settled', closedWhy: 'answered' },
            { key: 'renumber', s: 'next', t: 'Renumber the 2026 drafts that were never finalized', when: 'settled', closedWhy: 'superseded' },
            { key: 'january', s: 'decisions', t: 'Numbers restart at 000001 every January for each tenant', why: 'the format carries the year, so the series stays unbroken inside each year', when: 'recent' },
            { key: 'row', s: 'decisions', t: 'The counter row is created with the tenant, not on the first invoice', why: 'two first invoices raced and both tried to insert the row', when: 'recent' },
            { key: 'dates', s: 'decisions', t: 'Wave dates are fixed: 2026-12-08, 2026-12-15 and 2027-01-05', why: 'the bank holidays leave only those three quiet windows', when: 'recent' },
            { key: 'overlap', s: 'needs', t: 'ops/waves/wave2.csv has 3 tenants that also appear in wave 1', when: 'recent' },
            { key: 'rows', s: 'rules', t: 'Every migration script prints the number of rows it will touch before it runs', when: 'recent' },
        ],
        plantedSettled: ['restart', 'renumber'],
    },
    {
        id: 'cb-09', project: 'kestrel', size: 'small', plants: ['reason-easy-to-drop'], total: 30, spanMinutes: 180, decisions: [1, 2, 4], needs: [1, 2], rules: [0], exchanges: 3,
        extra: [{ key: 'zone', s: 'decisions', t: 'Preview builds are served from the preview.kestrel.test zone, not from a path under the main site', why: 'cookies of the main site would otherwise be sent to every preview build', when: 'old' }],
        plantedReasons: ['zone'],
    },
    {
        id: 'cb-10', project: 'harbor', size: 'medium', plants: ['reason-easy-to-drop'], total: 110, spanMinutes: 600, breakShare: 0.5, decisions: [0, 1, 3, 5, 8], needs: [0, 1, 3, 7], rules: [0, 2, 4], exchanges: 12,
        extra: [{ key: 'wave2', s: 'decisions', t: 'Wave 2 starts no earlier than 10 days after wave 1', why: 'the first monthly close after wave 1 must pass before more tenants move', when: 'old' }],
        plantedReasons: ['wave2'],
    },
    {
        id: 'cb-11', project: 'lantern', size: 'medium', plants: ['reason-easy-to-drop'], total: 125, spanMinutes: 700, decisions: [0, 2, 5, 7, 8, 9], needs: [1, 3, 4, 7], rules: [0, 1, 2], exchanges: 13,
        extra: [{ key: 'portal', s: 'decisions', t: 'The select menu renders in a portal at the end of the body element', why: 'a parent with overflow hidden cut the menu off on the billing page of a client app', when: 'old' }],
        plantedReasons: ['portal'],
    },
    {
        id: 'cb-12', project: 'marlin', size: 'small', plants: ['reason-easy-to-drop', 'invented-path-bait'], total: 36, spanMinutes: 220, decisions: [0, 1, 4], needs: [0, 2], rules: [1, 2], exchanges: 3,
        extra: [
            { key: 'worker', s: 'decisions', t: 'Search runs in a web worker', why: 'ranking 4,000 pages on the main thread froze typing for 300 ms', when: 'old' },
            { key: 'workertest', s: 'needs', t: 'The worker script has no test yet', when: 'recent' },
        ],
        turns: [
            { r: 'user', x: 'Where does the synonyms list go once I send it?' },
            { r: 'agent', x: 'The ranker in search/rank.mjs will read it next to the stop word list. The worker script loads the index and still has no test. I have not created the synonyms file yet, so it has no agreed name or location.' },
            { r: 'user', x: 'Fine, leave the name open until I send the list.' },
        ],
        plantedReasons: ['worker'],
        bait: [
            { about: 'worker script', invented: ['search/worker.mjs', 'search/search-worker.mjs', 'site/components/search-worker.mjs'] },
            { about: 'synonyms file', invented: ['search/synonyms.json', 'search/synonyms.tsv', 'build/synonyms.mjs'] },
        ],
    },
    {
        id: 'cb-13', project: 'quarry', size: 'medium', plants: ['reason-easy-to-drop'], total: 135, spanMinutes: 800, breakShare: 0.45, decisions: [0, 1, 3, 4, 7, 9], needs: [0, 1, 2, 6], rules: [0, 2, 3], exchanges: 14,
        extra: [{ key: 'status', s: 'decisions', t: 'Paused files are listed by quarry status instead of being hidden', why: 'a user in the field report believed the sync was complete while 3 files were paused', when: 'old' }],
        plantedReasons: ['status'],
    },
    {
        id: 'cb-14', project: 'marlin', size: 'small', plants: ['settled-reads-open'], total: 38, spanMinutes: 260, breakShare: 0.4, decisions: [0, 3], needs: [2, 3], rules: [0], exchanges: 4,
        extra: [{ key: 'crash', s: 'needs', t: 'build/pages.mjs crashes on pages without front matter', when: 'settled', closedWhy: 'done' }],
        plantedSettled: ['crash'],
    },
    {
        id: 'cb-15', project: 'orchard', size: 'medium', plants: ['settled-reads-open'], total: 120, spanMinutes: 720, breakShare: 0.4, decisions: [0, 1, 2, 5, 7], needs: [1, 5, 7, 8], rules: [0, 2, 4], exchanges: 12,
        note: 'Do not lose which merge request is waiting for my approval.',
        extra: [
            { key: 'move', s: 'next', t: 'Move the idempotency keys from Redis to the orders table', when: 'settled', closedWhy: 'done' },
            { key: 'expiry', s: 'needs', t: 'Operator must pick the key expiry: 24, 48 or 72 hours', q: true, when: 'settled', closedWhy: 'answered' },
        ],
        plantedSettled: ['move', 'expiry'],
    },
    {
        id: 'cb-16', project: 'quarry', size: 'medium', plants: ['settled-reads-open'], total: 105, spanMinutes: 640, breakShare: 0.45, decisions: [0, 1, 2, 3, 5], needs: [0, 2, 4, 5], rules: [0, 1, 2], exchanges: 11,
        extra: [{ key: 'linux', s: 'needs', t: 'tests/resume.rs fails on Linux in resumes_after_kill: the journal offset is stale', when: 'settled', closedWhy: 'done' }],
        plantedSettled: ['linux'],
    },
    {
        id: 'cb-17', project: 'kestrel', size: 'small', plants: ['settled-reads-open'], total: 32, spanMinutes: 200, breakShare: 0.4, decisions: [0, 1, 3], needs: [0, 1], rules: [0, 2], exchanges: 3,
        extra: [{ key: 'prompt', s: 'next', t: 'Add a confirmation prompt before overwriting an existing preview', when: 'settled', closedWhy: 'superseded' }],
        plantedSettled: ['prompt'],
    },
    {
        id: 'cb-18', project: 'harbor', size: 'medium', plants: ['forbidden-name-in-input'], total: 100, spanMinutes: 560, decisions: [1, 2, 4, 6, 9], needs: [1, 2, 4, 8], rules: [0, 1, 3], exchanges: 10,
        label: 'numbering | recap tab 2',
        turns: [
            { r: 'user', x: 'Is the counter change in?' },
            { r: 'tool', x: '', kind: 'other', what: 'recap plugin: refresh panel' },
            { r: 'tool', x: '', kind: 'other', what: 'tab list' },
            { r: 'agent', x: 'The counter change is in place. The concurrent test has not been rerun since, so I cannot say yet that the duplicate number is gone.' },
        ],
        notInOwn: ['recap', 'plugin', 'tab'],
    },
    {
        id: 'cb-19', project: 'lantern', size: 'medium', plants: ['forbidden-name-in-input'], total: 115, spanMinutes: 620, decisions: [0, 1, 2, 5, 8], needs: [0, 1, 4], rules: [0, 1, 3], exchanges: 11,
        extra: [
            { key: 'tabsdec', s: 'decisions', t: 'The Tabs component keeps only the selected tab panel mounted', why: 'mounting every panel made the settings page render 9 hidden forms', when: 'recent' },
            { key: 'tabsneed', s: 'needs', t: 'packages/react/src/tabs.tsx loses the selected tab after a theme switch', when: 'recent' },
            { key: 'plugindec', s: 'decisions', t: 'Chart renderers load through the plugin registry in packages/charts/src/registry.ts', why: 'the two client apps ship different sets of charts', when: 'recent' },
        ],
        turns: [
            { r: 'user', x: 'What about the tabs bug?' },
            { r: 'agent', x: 'packages/react/src/tabs.tsx still loses the selected tab after a theme switch. I have a failing snapshot for it and no fix yet.' },
        ],
        inOwn: ['tab', 'tabs', 'plugin'],
    },
    {
        id: 'cb-20', project: 'kestrel', size: 'small', plants: ['forbidden-name-in-input'], total: 30, spanMinutes: 170, decisions: [0, 2, 4], needs: [1, 2], rules: [1, 2], exchanges: 3,
        turns: [
            { r: 'user', x: 'Run the deploy tests again and tell me what is still red.' },
            { r: 'tool', x: '', kind: 'other', what: 'TodoWrite' },
            { r: 'tool', x: '', kind: 'agent', what: 'Task: read the uploader' },
            { r: 'tool', x: '', kind: 'other', what: 'ToolSearch select:WebFetch' },
            { r: 'tool', x: '--- FAIL: TestPreviewHash (0.01s)\n    preview_test.go:41: hash = 3fa9c1, want 9c1b7e\nFAIL', kind: 'shell', what: 'go test ./internal/deploy' },
            { r: 'agent', x: 'TestPreviewHash is still red: the hash depends on the path separator. I have not changed cmd/kestrel/deploy.go yet, so the URL is still printed before the readiness check.' },
        ],
        notInOwn: ['tools'],
    },
    {
        id: 'cb-21', project: 'marlin', size: 'small', plants: ['forbidden-name-in-input'], total: 33, spanMinutes: 210, decisions: [1, 2, 4], needs: [0, 1], rules: [0, 1], exchanges: 3,
        note: 'Keep the 900 kB budget and every open question. Also remember that I want the page title shown in the browser tab.',
        notInOwn: ['tab'],
        gateConflict: true,
    },
    { id: 'cb-22', project: 'colmena', size: 'small', plants: ['non-english-session'], total: 35, spanMinutes: 230, decisions: [0, 1, 3], needs: [0, 1], rules: [0, 2], exchanges: 4 },
    {
        id: 'cb-23', project: 'colmena', size: 'medium', plants: ['non-english-session', 'invented-path-bait'], total: 90, spanMinutes: 580, breakShare: 0.5, decisions: all(6), needs: all(4), rules: all(3), exchanges: 10,
        extra: [{ key: 'config', s: 'needs', t: 'El fichero de configuración del planificador todavía apunta a la carga completa', when: 'recent' }],
        turns: [
            { r: 'user', x: '¿Dónde está el script de la comparación semanal?' },
            { r: 'agent', x: 'Todavía no existe como script aparte: la lógica irá en etl/cargas/borrados.py. El fichero de configuración del planificador sigue apuntando a la carga completa y no lo he tocado.' },
            { r: 'user', x: 'De acuerdo. No cambies la configuración hasta que yo lo diga.' },
        ],
        bait: [
            { about: 'fichero de configuración del planificador', invented: ['etl/planificador.yaml', 'config/planificador.yml', 'etl/config.toml'] },
            { about: 'script de la comparación semanal', invented: ['etl/cargas/comparacion_semanal.py', 'scripts/comparacion.py'] },
        ],
    },
    { id: 'cb-24', project: 'farol', size: 'small', plants: ['non-english-session'], total: 36, spanMinutes: 240, decisions: [0, 1, 2], needs: [0, 1], rules: [0, 2], exchanges: 4 },
];
