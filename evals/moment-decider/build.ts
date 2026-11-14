import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

type Role = 'user' | 'agent' | 'tool';
type Kind = 'shell' | 'edit' | 'web' | 'agent' | 'other' | 'read';
type Side = 'true' | 'false' | 'open';

interface Entry {
    role: Role;
    text: string;
    at?: number;
    queued?: boolean;
    kind?: Kind;
    what?: string;
}

interface Fact {
    section: string;
    text: string;
    why: string | null;
    state: 'open' | 'closed';
    closedWhy: string | null;
    closedAt: number | null;
    firstAt: number;
    lastAt: number;
}

interface Evidence {
    question: string;
    field: 'last_prompt' | 'last_reply' | 'recent_turns' | 'goal' | 'open_work';
    quote: string;
}

interface Project {
    name: string;
    host: string;
    modules: readonly string[];
    files: readonly string[];
    commands: readonly string[];
}

interface Case {
    id: string;
    plants: readonly string[];
    size: 'small' | 'medium' | 'large';
    difficulty: 'easy' | 'medium' | 'hard';
    project: Project;
    ageHours: number;
    fillerEntries: number;
    fillerFacts: number;
    extraOpen: number;
    goal: string | null;
    open: readonly (readonly [string, string])[];
    tail: readonly Entry[];
    answers: Readonly<Record<string, Side>>;
    verdict: 'compact' | 'wait';
    evidence: readonly Evidence[];
    note: string;
}

const BASE = Date.UTC(2026, 10, 9, 9, 0, 0);
const HOUR = 3600 * 1000;

const orchard: Project = {
    name: 'orchard-api',
    host: 'git.orchard.test',
    modules: ['orders', 'pricing', 'inventory', 'checkout', 'refunds', 'webhooks', 'rate limiter', 'audit log'],
    files: ['src/orders/ledger.ts', 'src/pricing/rules.ts', 'src/http/limits.ts', 'src/checkout/session.ts', 'src/refunds/policy.ts', 'test/e2e/orders.test.ts', 'src/webhooks/retry.ts', 'src/cache/policy.ts'],
    commands: ['bun test test/e2e/orders.test.ts', 'bun run typecheck', 'git status --short', 'bun test test/e2e/checkout.test.ts', 'bun run lint'],
};
const lantern: Project = {
    name: 'lantern-ui',
    host: 'git.lantern.test',
    modules: ['header', 'sidebar', 'settings page', 'drawer', 'icon set', 'date formatter', 'theme switch', 'search box'],
    files: ['src/shell/Header.tsx', 'src/shell/Sidebar.tsx', 'src/settings/SettingsPage.tsx', 'src/shell/Drawer.tsx', 'src/icons/index.ts', 'src/format/date.ts', 'test/e2e/shell.spec.ts', 'src/theme/tokens.css'],
    commands: ['bun run build', 'bun test test/e2e/shell.spec.ts', 'bun run typecheck', 'git diff --stat', 'bun run storybook:check'],
};
const kestrel: Project = {
    name: 'kestrel-sync',
    host: 'git.kestrel.test',
    modules: ['watcher', 'conflict resolver', 'chunker', 'manifest', 'transport', 'scheduler', 'path mapper'],
    files: ['src/watcher/events.rs', 'src/resolver/merge.rs', 'src/chunker/rolling.rs', 'src/manifest/index.rs', 'src/transport/session.rs', 'tests/sync_roundtrip.rs', 'src/paths/mapper.rs'],
    commands: ['cargo test --test sync_roundtrip', 'cargo clippy --all-targets', 'cargo build --release', 'git log --oneline -5', 'cargo test resolver'],
};
const pebble: Project = {
    name: 'pebble-ci',
    host: 'ci.pebble.test',
    modules: ['runner pool', 'cache layer', 'artifact store', 'pipeline parser', 'secrets broker', 'log shipper'],
    files: ['runner/pool.go', 'cache/layers.go', 'artifacts/store.go', 'pipeline/parse.go', 'secrets/broker.go', 'runner/pool_test.go', 'deploy/runners.yaml'],
    commands: ['go test ./runner/...', 'go vet ./...', 'go build ./cmd/pebble', 'git status --short', 'go test ./cache/...'],
};
const marrow: Project = {
    name: 'marrow-db',
    host: 'git.marrow.test',
    modules: ['migration planner', 'lock manager', 'restore tool', 'benchmark harness', 'schema differ', 'checksum verifier'],
    files: ['planner/order.py', 'locks/manager.py', 'restore/apply.py', 'bench/harness.py', 'differ/schema.py', 'tests/test_restore.py', 'tests/test_planner.py'],
    commands: ['pytest tests/test_planner.py -q', 'pytest tests/test_restore.py -q', 'ruff check .', 'git status --short', 'python -m bench.harness --rows 200000'],
};
const tidewater: Project = {
    name: 'tidewater-docs',
    host: 'docs.tidewater.test',
    modules: ['search index', 'landing page', 'API reference', 'changelog', 'pricing page', 'footer', 'install guide'],
    files: ['content/guide/install.md', 'content/reference/api.md', 'layouts/footer.html', 'content/pricing.md', 'content/changelog.md', 'scripts/build-index.mjs', 'content/terms.md'],
    commands: ['npm run build', 'npm run check-links', 'git status --short', 'npm run build-index', 'npm run spellcheck'],
};

function seeded(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
        mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
        return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
    };
}

const pick = <T>(list: readonly T[], random: () => number): T => list[Math.floor(random() * list.length)] as T;

const u = (text: string): Entry => ({ role: 'user', text });
const a = (text: string): Entry => ({ role: 'agent', text });
const sh = (command: string): Entry => ({ role: 'tool', text: command, kind: 'shell' });
const described = (what: string): Entry => ({ role: 'tool', text: '', kind: 'shell', what });
const edit = (file: string): Entry => ({ role: 'tool', text: file, kind: 'edit' });
const read = (file: string): Entry => ({ role: 'tool', text: file, kind: 'read' });

const USER_FILL = [
    'Next: look at the {m} and tell me what is left before we can ship it.',
    'ok. now the {m}: keep the change small, and run the tests before you report.',
    'The {m} still behaves oddly on my side. Can you check {f} and fix what you find?',
    'Good. Please write down what you changed in the {m} so the next person can follow it.',
    'Before anything else, make sure the {m} change did not break {f}.',
];
const AGENT_FILL = [
    'The {m} is done: I changed {f}, the tests pass and nothing else needed touching.',
    'I read {f}. The {m} has two callers; I am updating both and then running the suite.',
    'Checked the {m}: one edge case was missing in {f}. Fixed it and added a test for it.',
    'The {m} change is in. Typecheck and lint are clean; the full suite took a little over a minute.',
    'Found the cause in {f}: the {m} read a stale value. I am applying the fix now.',
];
const DONE_FILL = ['Reworked the {m} so it no longer depends on the old helper', 'Added end-to-end coverage for the {m}', 'Fixed the {m} edge case reported during review', 'Documented how the {m} is configured', 'Removed the dead code path in the {m}'];
const DECISION_FILL: readonly (readonly [string, string])[] = [
    ['Keep the {m} behind a flag until the next release', 'the operator wants one release of soak time'],
    ['The {m} keeps its current public names', 'renaming would break two downstream callers'],
    ['Tests for the {m} run end to end, not as units', 'unit tests missed the last two regressions'],
];
const RULE_FILL = ['Never push to the main branch of {p} directly', 'Run the full suite before reporting a {m} change as done', 'Keep every change to the {m} in its own commit'];
const CLOSED_FILL = ['Check why the {m} test is slow', 'Rebase the {m} branch on main', 'Ask whether the {m} flag can be removed', 'Rerun the {m} suite after the fix'];
const OPEN_FILL = ['Port the {m} tests to the new runner', 'Write the release note for the {m}', 'Remove the old {m} flag once the release is out', 'Add a dashboard panel for the {m}', 'Review error messages in the {m}'];

const fill = (template: string, project: Project, random: () => number): string =>
    template.replaceAll('{m}', pick(project.modules, random)).replaceAll('{f}', pick(project.files, random)).replaceAll('{p}', project.name);

function fillerEntries(project: Project, count: number, random: () => number): Entry[] {
    const made: Entry[] = [];
    while (made.length < count) {
        made.push(u(fill(pick(USER_FILL, random), project, random)));
        const steps = 2 + Math.floor(random() * 3);
        for (let step = 0; step < steps && made.length < count; step += 1) {
            const calls = 2 + Math.floor(random() * 5);
            for (let call = 0; call < calls && made.length < count; call += 1) {
                const roll = random();
                made.push(roll < 0.35 ? read(pick(project.files, random)) : roll < 0.6 ? edit(pick(project.files, random)) : roll < 0.8 ? sh(pick(project.commands, random)) : described(`Run the ${pick(project.modules, random)} checks`));
            }
            if (made.length < count) made.push(a(fill(pick(AGENT_FILL, random), project, random)));
        }
    }
    return made.slice(0, count);
}

function stamped(entries: readonly Entry[], endAt: number, random: () => number): Entry[] {
    let at = endAt;
    const out: Entry[] = [];
    for (const entry of entries.toReversed()) {
        out.push({ ...entry, at });
        at -= 5000 + Math.floor(random() * 90000);
    }
    return out.toReversed();
}

function fact(section: string, text: string, at: number, why: string | null = null, closedWhy: string | null = null): Fact {
    const closed = closedWhy !== null;
    return { section, text, why, state: closed ? 'closed' : 'open', closedWhy, closedAt: closed ? at + 20 * 60 * 1000 : null, firstAt: at, lastAt: closed ? at + 10 * 60 * 1000 : at + 30 * 60 * 1000 };
}

function fillerFacts(project: Project, count: number, startAt: number, random: () => number): Fact[] {
    const made: Fact[] = [];
    for (let index = 0; index < count; index += 1) {
        const at = startAt + index * 7 * 60 * 1000;
        const roll = random();
        if (roll < 0.45) made.push(fact('done', fill(pick(DONE_FILL, random), project, random), at));
        else if (roll < 0.62) made.push(fact(pick(['now', 'now', 'next', 'needs'], random), fill(pick(CLOSED_FILL, random), project, random), at, null, pick(['done', 'done', 'answered', 'superseded'], random)));
        else if (roll < 0.8) made.push(fact('links', `https://${project.host}/${project.name}/-/merge_requests/${10 + Math.floor(random() * 80)}`, at));
        else if (roll < 0.92) {
            const [text, why] = pick(DECISION_FILL, random);
            made.push(fact('decisions', fill(text, project, random), at, why));
        } else made.push(fact('rules', fill(pick(RULE_FILL, random), project, random), at));
    }
    return made;
}

const NO: Readonly<Record<string, Side>> = { closes_request: 'false', announces_continuation: 'false', asks_detailed_choice: 'false', needs_verbatim: 'false', changes_subject: 'false', stuck: 'false' };
const sides = (changed: Readonly<Record<string, Side>>): Readonly<Record<string, Side>> => ({ ...NO, ...changed });

const LONG_PROGRESS = [
    'Done with the header and the sidebar. Here is where things stand.',
    '',
    'Header: the three breakpoints now share one layout component instead of three copies. The logo, the search box and the account menu are slots, so the mobile variant is the same component with two slots hidden. I removed 212 lines from src/shell/Header.tsx and the snapshot tests were regenerated; the only visual difference is that the account menu is 2 px lower at the narrowest width, which matches the design file.',
    '',
    'Sidebar: the collapsed state is kept in the URL now instead of local storage, as you asked, so a shared link opens the same way for everybody. Keyboard navigation works: arrow keys move between groups, Enter opens a group, Escape collapses it. The old `SidebarLegacy` export is still there because the settings page imports it; it goes away with that page.',
    '',
    'Checks so far: typecheck is clean, the shell end-to-end suite passes (41 of 41), and the storybook check found no orphaned stories. I also looked at the bundle: the shell chunk went from 84 kB to 71 kB.',
    '',
    'Two things I noticed on the way and did not touch: the theme switch re-renders the whole shell on every toggle, which costs about 40 ms on a slow phone, and the search box still debounces at 500 ms where the design asks for 200 ms. Both are small, both are outside the three screens you named, and I wrote them down in docs/shell/followups.md so they are not lost. I also left the old breakpoint variables in src/theme/tokens.css in place, because the settings page still reads two of them.',
    '',
    'What is not done: the settings page. It still uses the legacy sidebar export and the old form controls, and it has no end-to-end test at all. It is the last of the three screens in your request.',
    '',
    'I am starting on the settings page now: first the form controls, then the legacy export, then a test for the save flow. I will report again when it passes.',
].join('\n');

const LONG_FINAL = [
    'The icon audit is finished and merged. Summary of what was delivered:',
    '',
    '1. Inventory. Every icon under src/icons was matched against its imports across the app. 212 icons exist, 203 are used, 9 are never imported. The nine unused ones are listed in docs/icons/unused.md with the commit that last touched each.',
    '',
    '2. Duplicates. 14 icons were pixel-identical pairs under two names (for example `close` and `x`, `gear` and `settings`). Each pair now has one file and one alias export, so no call site had to change. The aliases are marked deprecated so the linter will point at them.',
    '',
    '3. Sizes. All icons now use the same 24 unit view box. 31 icons used 20 or 16 and were scaled; I checked each of them in the storybook grid at 16, 20 and 24 px and none lost a detail that mattered. The grid story is new and is part of the storybook check.',
    '',
    '4. Accessibility. Decorative icons carry aria-hidden; the 22 icons used as the only content of a button now require a label prop, and the typecheck fails without it. That found 6 buttons with no accessible name, all fixed in the same change.',
    '',
    '5. Naming. Icon files are now all kebab-case and the export names are generated from the file names by one script, scripts/icons.mjs, so the two can no longer drift apart. 17 files were renamed; the old export names are kept as aliases under the same deprecation rule as the duplicates, and the script fails the build when a file has no export or an export has no file.',
    '',
    '6. Documentation. docs/icons/README.md explains how to add an icon, which sizes to check in the grid story, and when a label is required. It replaces the three partial notes that existed before, which are deleted.',
    '',
    '7. Checks. Typecheck, lint, the shell end-to-end suite and the storybook check all pass. The icon chunk went from 96 kB to 88 kB.',
    '',
    'Merge request 57 was approved and merged into main an hour ago, and the pipeline on main is green. Nothing from this request is left open on my side.',
].join('\n');

const LONG_COMPARE = [
    'I compared the two cache strategies for the pricing lookups on the staging copy, with the same 30 minutes of recorded traffic replayed against each.',
    '',
    'What both have in common: the cache sits in front of the pricing rules engine, keys are the product id plus the customer tier, and a rule change publishes an invalidation event. Neither changes the public API.',
    '',
    'How I measured: 184 000 lookups replayed at recorded pace, then again at four times the pace. I recorded the hit ratio, the p50 and p99 latency of a lookup, memory held by the cache process, and how long a rule change took to be visible to every instance. Each run was repeated three times and the numbers below are medians. The replay tool and the raw output are in a scratch directory on the staging box that is wiped every night, so these figures are not stored anywhere else yet.',
    '',
    'Observations that apply to both: the rules engine itself answers in about 38 ms at p50, so any hit ratio above 90 % makes the cache the dominant factor; and the tier is part of the key, so the six tiers multiply the number of entries.',
    '',
    'My recommendation is option B, because stale prices are the failure you said you cannot accept, and B bounds staleness at 5 seconds where A can serve a stale price for up to 10 minutes after a missed event. The cost is latency at the tail.',
    '',
    'The two options, so you can choose:',
    '',
    'Option A, write-through with event invalidation: hit ratio 97.4 %, p50 1.1 ms, p99 9 ms, 410 MB of memory, a rule change visible in 0.4 s when the event arrives, and up to 600 s stale when an event is lost (it happened twice in the replay).',
    '',
    'Option B, short time-to-live of 5 s with a background refresh: hit ratio 91.8 %, p50 1.3 ms, p99 44 ms, 290 MB of memory, a rule change visible in at most 5 s always, no dependency on the event bus.',
    '',
    'Which one do you want me to implement, A or B?',
].join('\n');

const PATCH_REPLY = [
    'Here is the patch for the webhook retry policy, not applied yet, as you asked:',
    '',
    '```diff',
    '--- a/src/webhooks/retry.ts',
    '+++ b/src/webhooks/retry.ts',
    '@@ -18,9 +18,12 @@ export function nextAttempt(attempt: number, status: number): number | null {',
    '-    if (attempt >= 5) return null;',
    '-    return 1000 * 2 ** attempt;',
    '+    if (attempt >= 8) return null;',
    '+    if (status === 410) return null;',
    '+    const base = status === 429 ? 15000 : 1000;',
    '+    const jitter = Math.floor(base * 0.2 * jitterOf(attempt));',
    '+    return Math.min(base * 2 ** attempt + jitter, 900000);',
    ' }',
    '```',
    '',
    'It raises the limit from 5 to 8 attempts, stops at once on a 410, starts from 15 s after a 429, adds 20 % jitter and caps a wait at 15 minutes. I wrote it in the reply only; it is not in the working tree and not in a branch. Should I apply it?',
].join('\n');

const cases: Case[] = [
    {
        id: 'md-01-midwork-unrelated-prompt', plants: ['mid-work', 'changes-subject'], size: 'small', difficulty: 'medium', project: orchard, ageHours: 0, fillerEntries: 0, fillerFacts: 3, extraOpen: 0,
        goal: 'Ship the rate limiter for the /orders endpoint',
        open: [['now', 'Wire the limiter into the orders router'], ['next', 'Run the orders end-to-end suite with the limiter on']],
        tail: [
            u('Separate thing, nothing to do with the limiter: the build badges in the README are broken, they all show "unknown". Fix them.'),
            read('README.md'),
            a('I am looking at the badge URLs now. They still point at the old pipeline name; I will update the four of them and then check that each one renders.'),
            edit('README.md'),
        ],
        answers: sides({ announces_continuation: 'true', changes_subject: 'true' }), verdict: 'wait',
        evidence: [{ question: 'announces_continuation', field: 'last_reply', quote: 'I will update the four of them and then check that each one renders' }, { question: 'changes_subject', field: 'last_prompt', quote: 'nothing to do with the limiter' }],
        note: 'The prompt is unrelated to the goal, which alone would allow compaction, but the agent is mid-work on it.',
    },
    {
        id: 'md-02-midwork-background-job', plants: ['mid-work', 'command-running'], size: 'medium', difficulty: 'easy', project: pebble, ageHours: 0, fillerEntries: 14, fillerFacts: 18, extraOpen: 2,
        goal: 'Raise the cache hit rate of the pipeline to at least 80 %',
        open: [['now', 'Measure the cache hit rate after the layer-key change'], ['next', 'Compare the hit rate with last week\'s baseline of 61 %']],
        tail: [
            u('Run the full pipeline with the new layer keys and tell me the hit rate.'),
            edit('cache/layers.go'),
            sh('go build ./cmd/pebble'),
            described('Start pipeline run 4127 in the background'),
            a('I started the full pipeline (run 4127) in the background; it takes about 12 minutes. I am waiting for it to finish, then I will read the cache hit numbers from its summary and report them.'),
            described('Wait for pipeline run 4127'),
        ],
        answers: sides({ announces_continuation: 'true' }), verdict: 'wait',
        evidence: [{ question: 'announces_continuation', field: 'last_reply', quote: 'I am waiting for it to finish' }],
        note: 'A background job is running and the agent waits for it by itself.',
    },
    {
        id: 'md-03-midwork-prompt-far-back', plants: ['mid-work', 'prompt-outside-recent-turns'], size: 'large', difficulty: 'medium', project: kestrel, ageHours: 0, fillerEntries: 70, fillerFacts: 90, extraOpen: 6,
        goal: 'Port all seven modules of kestrel-sync to the async runtime',
        open: [['now', 'Port the watcher module to the async runtime'], ['next', 'Port the scheduler module after the watcher'], ['next', 'Run the round-trip sync test on all seven modules']],
        tail: [
            u('Port the remaining modules to the async runtime, one at a time, tests green after each. Do not stop to ask me between modules.'),
            read('src/chunker/rolling.rs'), edit('src/chunker/rolling.rs'), sh('cargo test --test sync_roundtrip'),
            a('The chunker is ported and its tests pass.'),
            read('src/manifest/index.rs'), edit('src/manifest/index.rs'), edit('src/manifest/index.rs'), sh('cargo test --test sync_roundtrip'), sh('cargo clippy --all-targets'),
            a('The manifest is ported; clippy is clean.'),
            read('src/transport/session.rs'), edit('src/transport/session.rs'), sh('cargo test --test sync_roundtrip'),
            a('Three of the seven modules are ported now (chunker, manifest, transport) and the round-trip test is green after each. Continuing with the watcher module next.'),
            read('src/watcher/events.rs'), edit('src/watcher/events.rs'),
        ],
        answers: sides({ announces_continuation: 'true' }), verdict: 'wait',
        evidence: [{ question: 'announces_continuation', field: 'last_reply', quote: 'Continuing with the watcher module next' }, { question: 'closes_request', field: 'last_prompt', quote: 'Port the remaining modules' }],
        note: 'A long autonomous run: the prompt is outside recent_turns but present as last_prompt; three of seven modules is a progress note.',
    },
    {
        id: 'md-04-midwork-stuck-retrying', plants: ['mid-work', 'stuck'], size: 'medium', difficulty: 'medium', project: marrow, ageHours: 0, fillerEntries: 12, fillerFacts: 22, extraOpen: 1,
        goal: 'Make the migration planner order dependent migrations correctly',
        open: [['now', 'Get tests/test_planner.py green with the new ordering'], ['needs', 'A decision on whether cyclic migrations are rejected or split']],
        tail: [
            u('The planner test still fails on my side. Make it pass.'),
            sh('pytest tests/test_planner.py -q'),
            a('The test fails with `LockTimeout: could not acquire schema lock after 30s` in test_orders_dependents. I am rerunning it after clearing the lock table.'),
            sh('pytest tests/test_planner.py -q'),
            a('Same failure again: `LockTimeout: could not acquire schema lock after 30s`, same test. Rerunning once more with the lock table cleared and the fixture recreated.'),
            sh('pytest tests/test_planner.py -q'),
            a('It failed a third time with the same `LockTimeout: could not acquire schema lock after 30s`. Nothing I changed moved it. I will try once more with a longer timeout.'),
            sh('pytest tests/test_planner.py -q'),
        ],
        answers: sides({ announces_continuation: 'true', stuck: 'true', needs_verbatim: 'open' }), verdict: 'wait',
        evidence: [{ question: 'stuck', field: 'recent_turns', quote: 'It failed a third time with the same' }, { question: 'announces_continuation', field: 'last_reply', quote: 'I will try once more with a longer timeout' }],
        note: 'The same test fails three times with the same error and the agent keeps going. Whether the error text is needed verbatim is left open: it can be reproduced by rerunning.',
    },
    {
        id: 'md-05-midwork-reply-opens-with-done', plants: ['mid-work', 'long-reply-clipped', 'reply-opens-with-done'], size: 'large', difficulty: 'hard', project: lantern, ageHours: 0, fillerEntries: 60, fillerFacts: 70, extraOpen: 4,
        goal: 'Rebuild the three shell screens (header, sidebar, settings page) on the new layout component',
        open: [['now', 'Move the settings page to the new form controls'], ['next', 'Delete the SidebarLegacy export once the settings page stops importing it'], ['next', 'Add an end-to-end test for the settings save flow']],
        tail: [
            u('Rebuild the header, the sidebar and the settings page on the new layout component. Report when all three are done.'),
            edit('src/shell/Header.tsx'), edit('src/shell/Sidebar.tsx'), sh('bun run typecheck'), sh('bun test test/e2e/shell.spec.ts'), sh('bun run storybook:check'),
            a(LONG_PROGRESS),
            read('src/settings/SettingsPage.tsx'),
        ],
        answers: sides({ announces_continuation: 'true' }), verdict: 'wait',
        evidence: [{ question: 'announces_continuation', field: 'last_reply', quote: 'I am starting on the settings page now' }, { question: 'closes_request', field: 'last_reply', quote: 'What is not done: the settings page' }],
        note: 'The reply opens with "Done with" but two of three screens is a partial result; the reply is longer than 1800 characters, so the state shows it clipped in the middle.',
    },
    {
        id: 'md-06-finished-short-answer', plants: ['finished-idle'], size: 'small', difficulty: 'easy', project: tidewater, ageHours: 0, fillerEntries: 0, fillerFacts: 2, extraOpen: 0,
        goal: 'Publish the new install guide',
        open: [['next', 'Add the Windows section to the install guide']],
        tail: [
            u('Which Node version does the docs build need? I want to put it in the install guide.'),
            read('.tool-versions'),
            a('Node 22. It is pinned in `.tool-versions`, and the build script refuses anything older than 22.3.'),
        ],
        answers: sides({ closes_request: 'true' }), verdict: 'compact',
        evidence: [{ question: 'closes_request', field: 'last_reply', quote: 'Node 22' }],
        note: 'A question answered; nothing announced, nothing asked.',
    },
    {
        id: 'md-07-finished-merged', plants: ['finished-idle'], size: 'medium', difficulty: 'easy', project: orchard, ageHours: 0, fillerEntries: 16, fillerFacts: 24, extraOpen: 2,
        goal: 'Make refunds idempotent',
        open: [['next', 'Announce the refund change in the release notes']],
        tail: [
            u('Looks good. Merge it once the pipeline is green.'),
            sh('bun test test/e2e/orders.test.ts'),
            described('Check the pipeline of merge request 41'),
            described('Merge merge request 41'),
            a('Merged. The pipeline was green (all 318 tests), merge request 41 is in main, and the branch is deleted. The refund endpoint now returns the first result for a repeated idempotency key.'),
        ],
        answers: sides({ closes_request: 'true' }), verdict: 'compact',
        evidence: [{ question: 'closes_request', field: 'last_reply', quote: 'merge request 41 is in main' }],
        note: 'The request was to merge; the reply reports it merged.',
    },
    {
        id: 'md-08-finished-long-report-many-open', plants: ['finished-idle', 'long-reply-clipped', 'open-work-over-twelve'], size: 'large', difficulty: 'medium', project: lantern, ageHours: 0, fillerEntries: 90, fillerFacts: 140, extraOpen: 15,
        goal: 'Audit the icon set and remove duplicates',
        open: [['next', 'Delete the nine unused icons after the next release'], ['next', 'Remove the deprecated icon aliases in the release after that']],
        tail: [
            u('Finish the icon audit, get it merged, and give me the full summary.'),
            sh('bun run typecheck'), sh('bun run storybook:check'), described('Merge merge request 57'),
            a(LONG_FINAL),
        ],
        answers: sides({ closes_request: 'true' }), verdict: 'compact',
        evidence: [{ question: 'closes_request', field: 'last_reply', quote: 'Nothing from this request is left open on my side' }, { question: 'closes_request', field: 'last_reply', quote: 'The icon audit is finished and merged' }],
        note: 'A long final report, clipped in the middle; more than twelve open items exist for later releases, all of them in the ledger, none needed from the conversation.',
    },
    {
        id: 'md-09-finished-unrelated-question', plants: ['finished-idle', 'changes-subject'], size: 'medium', difficulty: 'easy', project: kestrel, ageHours: 0, fillerEntries: 18, fillerFacts: 20, extraOpen: 2,
        goal: 'Make the conflict resolver keep both versions when two edits collide',
        open: [['next', 'Add a round-trip test for a three-way conflict']],
        tail: [
            a('The resolver now keeps both versions and names the second one with the device id; the round-trip test passes.'),
            u('Thanks. Unrelated question while I have you: what is the cron expression for every weekday at 07:00?'),
            a('`0 7 * * 1-5`: minute 0, hour 7, any day of the month, any month, Monday to Friday.'),
        ],
        answers: sides({ closes_request: 'true', changes_subject: 'true' }), verdict: 'compact',
        evidence: [{ question: 'changes_subject', field: 'last_prompt', quote: 'Unrelated question' }, { question: 'closes_request', field: 'last_reply', quote: '0 7 * * 1-5' }],
        note: 'An unrelated question, fully answered.',
    },
    {
        id: 'md-10-finished-no-goal-empty-ledger', plants: ['finished-idle', 'no-goal'], size: 'small', difficulty: 'medium', project: pebble, ageHours: 0, fillerEntries: 0, fillerFacts: 0, extraOpen: 0,
        goal: null, open: [],
        tail: [
            u('Rename the package from pebble-agent to pebble-runner everywhere.'),
            sh('git grep -l pebble-agent'), edit('go.mod'), edit('deploy/runners.yaml'), sh('go build ./cmd/pebble'), sh('go vet ./...'),
            a('Renamed in 14 files: the module path, the deployment manifest, the Makefile and the imports. The build and `go vet` pass, and `git grep pebble-agent` finds nothing any more.'),
        ],
        answers: sides({ closes_request: 'true' }), verdict: 'compact',
        evidence: [{ question: 'closes_request', field: 'last_reply', quote: 'Renamed in 14 files' }],
        note: 'A first turn on a lane with no ledger: goal is null and open_work is empty. With no goal, changes_subject is false by the question\'s own wording.',
    },
    {
        id: 'md-11-waits-three-options', plants: ['waiting-on-operator', 'detailed-choice'], size: 'medium', difficulty: 'easy', project: marrow, ageHours: 0, fillerEntries: 14, fillerFacts: 26, extraOpen: 2,
        goal: 'Make the migration planner order dependent migrations correctly',
        open: [['needs', 'A decision on how the planner treats cyclic migrations'], ['next', 'Implement the chosen treatment of cycles in planner/order.py']],
        tail: [
            u('The planner hangs when two migrations depend on each other. Fix that.'),
            read('planner/order.py'), sh('pytest tests/test_planner.py -q'),
            a([
                'I found the cause: the planner walks the dependency graph without remembering visited nodes, so a cycle never ends. Before I change it, there are three ways to treat a cycle and they behave differently for the people writing migrations:',
                '',
                '1. Reject: the planner stops and prints the cycle (for example `0042_orders -> 0047_refunds -> 0042_orders`). Nothing runs. Smallest change, about 20 lines.',
                '2. Split: the planner runs the schema part of both migrations first and the data part after, which resolves most cycles we have (4 of the 5 in the history). About 150 lines and a new file format rule.',
                '3. Order by date: the planner breaks the cycle at the oldest migration and warns. No migration author has to change anything, but one of the two runs against a schema it did not expect.',
                '',
                'Which of the three do you want?',
            ].join('\n')),
        ],
        answers: sides({ asks_detailed_choice: 'true', needs_verbatim: 'open' }), verdict: 'wait',
        evidence: [{ question: 'asks_detailed_choice', field: 'last_reply', quote: 'Which of the three do you want?' }],
        note: 'Three options described only in the reply. Whether that also counts as verbatim material is left open; the verdict is wait either way.',
    },
    {
        id: 'md-12-waits-delivered-then-choice', plants: ['waiting-on-operator', 'detailed-choice', 'closes-but-unsafe', 'long-reply-clipped'], size: 'large', difficulty: 'hard', project: orchard, ageHours: 0, fillerEntries: 80, fillerFacts: 110, extraOpen: 5,
        goal: 'Cut the latency of pricing lookups without ever serving a stale price for long',
        open: [['needs', 'The operator chooses the cache strategy for pricing lookups'], ['next', 'Implement the chosen cache strategy behind a flag']],
        tail: [
            u('Compare write-through against a short time-to-live for the pricing cache on staging and report what you measure, with a recommendation.'),
            described('Replay recorded traffic against the write-through cache'), described('Replay recorded traffic against the time-to-live cache'), read('src/cache/policy.ts'),
            a(LONG_COMPARE),
        ],
        answers: sides({ closes_request: 'true', asks_detailed_choice: 'true', needs_verbatim: 'open' }), verdict: 'wait',
        evidence: [{ question: 'asks_detailed_choice', field: 'last_reply', quote: 'Which one do you want me to implement, A or B?' }, { question: 'asks_detailed_choice', field: 'last_reply', quote: 'p99 44 ms' }, { question: 'closes_request', field: 'last_reply', quote: 'My recommendation is option B' }],
        note: 'The comparison and recommendation asked for are delivered, yet the reply ends on a choice between two options whose figures exist only there. Closing the request must not carry the verdict. needs_verbatim is left open: the figures sit in last_reply, while recent_turns shows only the first 600 characters of that reply.',
    },
    {
        id: 'md-13-waits-options-in-operator-words', plants: ['waiting-on-operator', 'options-from-operator'], size: 'small', difficulty: 'hard', project: lantern, ageHours: 0, fillerEntries: 0, fillerFacts: 4, extraOpen: 0,
        goal: 'Decide the navigation of the mobile shell',
        open: [['needs', 'The operator picks the drawer or the old tabs for mobile navigation']],
        tail: [
            u('For mobile navigation it is either the drawer or the old tabs, I do not mind which. Check which one is less work and tell me.'),
            read('src/shell/Drawer.tsx'), sh('git diff --stat'),
            a('I checked: the drawer is less work. Do you want the drawer or the old tabs?'),
        ],
        answers: sides({ closes_request: 'true' }), verdict: 'compact',
        evidence: [{ question: 'closes_request', field: 'last_reply', quote: 'the drawer is less work' }, { question: 'asks_detailed_choice', field: 'last_prompt', quote: 'either the drawer or the old tabs' }],
        note: 'The reply answers what was asked and ends on a choice, but both options are the operator\'s own words and carry no detail of their own, so asks_detailed_choice is false.',
    },
    {
        id: 'md-14-waits-optional-offer', plants: ['waiting-on-operator', 'optional-offer'], size: 'medium', difficulty: 'medium', project: kestrel, ageHours: 0, fillerEntries: 15, fillerFacts: 19, extraOpen: 2,
        goal: 'Map paths correctly between Linux and macOS devices',
        open: [['next', 'Handle Windows drive letters in the path mapper']],
        tail: [
            u('Fix the case-sensitivity bug in the path mapper for macOS and add a test.'),
            edit('src/paths/mapper.rs'), edit('tests/sync_roundtrip.rs'), sh('cargo test --test sync_roundtrip'),
            a('Fixed. The mapper now compares paths case-insensitively when the target device reports a case-insensitive volume, and the new round-trip test covers `Readme.md` against `README.md`. All 58 tests pass. Shall I go on with the Windows drive letters?'),
        ],
        answers: sides({ closes_request: 'true' }), verdict: 'compact',
        evidence: [{ question: 'closes_request', field: 'last_reply', quote: 'All 58 tests pass' }, { question: 'announces_continuation', field: 'last_reply', quote: 'Shall I go on with the Windows drive letters?' }],
        note: 'The request is delivered and the reply ends by asking whether to go on: the question text says this closes the request and is not a continuation.',
    },
    {
        id: 'md-15-verbatim-pasted-trace', plants: ['verbatim', 'mid-work'], size: 'small', difficulty: 'easy', project: pebble, ageHours: 0, fillerEntries: 0, fillerFacts: 5, extraOpen: 0,
        goal: 'Stop the image build from being killed on the small runners',
        open: [['now', 'Find which build step exhausts memory on the small runners']],
        tail: [
            u([
                'The image build died again on runner r-small-07. This is all I got before the log was rotated away:',
                '',
                'step 14/31 RUN make bundle',
                'layer sha256:9c41e7b02a6d55f3 extracted 1.84 GB',
                'cgroup memory.max 2147483648 reached, rss 2139095040',
                'exit 137 after 412 s',
                '',
                'Find out why.',
            ].join('\n')),
            read('deploy/runners.yaml'),
            a('I read the trace. The kill is at step 14 of 31 and the resident size is 8 MB under the 2 GiB limit, so the bundle step itself fills the memory. Next I am going to rebuild from the layer in your paste and bisect the bundle targets against the 412 s mark.'),
        ],
        answers: sides({ announces_continuation: 'true', needs_verbatim: 'true' }), verdict: 'wait',
        evidence: [{ question: 'needs_verbatim', field: 'recent_turns', quote: 'layer sha256:9c41e7b02a6d55f3 extracted 1.84 GB' }, { question: 'needs_verbatim', field: 'recent_turns', quote: 'before the log was rotated away' }, { question: 'announces_continuation', field: 'last_reply', quote: 'Next I am going to rebuild from the layer in your paste' }],
        note: 'The operator pasted the only copy of a trace; the next step uses its digest and timing.',
    },
    {
        id: 'md-16-verbatim-figures-only-blocker', plants: ['verbatim', 'closes-but-unsafe'], size: 'medium', difficulty: 'hard', project: marrow, ageHours: 0, fillerEntries: 17, fillerFacts: 28, extraOpen: 1,
        goal: 'Publish the restore benchmark report for the release',
        open: [['next', 'Write the measured restore figures into docs/benchmarks/restore.md'], ['next', 'Send the benchmark report to the release channel']],
        tail: [
            u('Run the restore benchmark on the temporary 200 000 row dataset and give me the numbers. You can drop the dataset afterwards.'),
            sh('python -m bench.harness --rows 200000'),
            described('Drop the temporary benchmark dataset'),
            a([
                'The benchmark ran and the temporary dataset is dropped. The numbers, medians of five runs:',
                '',
                '- full restore: 47.3 s (previous release: 71.9 s)',
                '- restore with checksum verification: 58.6 s (previous: 96.2 s)',
                '- peak memory: 1.12 GB (previous: 1.48 GB)',
                '- rows per second: 4228 plain, 3413 verified',
                '',
                'The harness printed these to the terminal only; it does not write a result file, and the dataset no longer exists, so they cannot be read again without rebuilding the dataset.',
            ].join('\n')),
        ],
        answers: sides({ closes_request: 'true', needs_verbatim: 'true' }), verdict: 'wait',
        evidence: [{ question: 'needs_verbatim', field: 'recent_turns', quote: 'restore with checksum verification: 58.6 s' }, { question: 'needs_verbatim', field: 'open_work', quote: 'Write the measured restore figures into docs/benchmarks/restore.md' }, { question: 'closes_request', field: 'last_reply', quote: 'The benchmark ran and the temporary dataset is dropped' }],
        note: 'The request is delivered and nothing is announced or asked; the only reason to wait is that the next open item needs figures that exist only in the reply.',
    },
    {
        id: 'md-17-verbatim-unapplied-patch', plants: ['verbatim', 'closes-but-unsafe'], size: 'large', difficulty: 'hard', project: orchard, ageHours: 0, fillerEntries: 65, fillerFacts: 85, extraOpen: 4,
        goal: 'Make webhook delivery survive a slow receiver',
        open: [['needs', 'The operator approves the retry policy patch'], ['next', 'Apply the reviewed patch to src/webhooks/retry.ts and run the webhook suite']],
        tail: [
            u('Write the new retry policy as a patch and show it to me before you touch the file.'),
            read('src/webhooks/retry.ts'), read('test/e2e/orders.test.ts'),
            a(PATCH_REPLY),
        ],
        answers: sides({ closes_request: 'true', needs_verbatim: 'true' }), verdict: 'wait',
        evidence: [{ question: 'closes_request', field: 'last_reply', quote: 'Here is the patch for the webhook retry policy, not applied yet, as you asked' }, { question: 'needs_verbatim', field: 'recent_turns', quote: 'return Math.min(base * 2 ** attempt + jitter, 900000);' }, { question: 'needs_verbatim', field: 'last_reply', quote: 'it is not in the working tree and not in a branch' }, { question: 'needs_verbatim', field: 'open_work', quote: 'Apply the reviewed patch' }],
        note: 'The patch was shown as asked and exists only in the reply; applying it is the next open item. The closing question is a yes or no, not a choice between described options.',
    },
    {
        id: 'md-18-verbatim-not-needed', plants: ['verbatim', 'exact-text-recoverable'], size: 'medium', difficulty: 'hard', project: lantern, ageHours: 0, fillerEntries: 13, fillerFacts: 21, extraOpen: 2,
        goal: 'Fix the hydration mismatch on the dashboard',
        open: [['next', 'Open the merge request for branch fix/hydration']],
        tail: [
            u('The dashboard logs a hydration warning on first load. Find it and fix it.'),
            sh('bun run build'), read('src/format/date.ts'), edit('src/format/date.ts'), sh('bun test test/e2e/shell.spec.ts'),
            a('Fixed. The warning was `Text content did not match. Server: "9 Nov" Client: "Nov 9"`: the date formatter used the server locale on the server and the browser locale in the client. It now takes the locale from the request on both sides. The fix is commit 4f2a91c on branch fix/hydration, pushed, and the shell suite passes with no warning in the log.'),
        ],
        answers: sides({ closes_request: 'true' }), verdict: 'compact',
        evidence: [{ question: 'closes_request', field: 'last_reply', quote: 'The fix is commit 4f2a91c on branch fix/hydration, pushed' }, { question: 'needs_verbatim', field: 'open_work', quote: 'Open the merge request for branch fix/hydration' }],
        note: 'The reply quotes an error and a commit id, but the error is fixed and the commit is pushed on a branch that open_work names: the next step can look everything up.',
    },
    {
        id: 'md-19-verbatim-dictated-wording', plants: ['verbatim', 'stopped-partial'], size: 'large', difficulty: 'medium', project: tidewater, ageHours: 0, fillerEntries: 55, fillerFacts: 75, extraOpen: 3,
        goal: 'Put the new data-retention notice on every page that collects an email address',
        open: [['next', 'Add the retention notice to the three remaining pages: pricing, changelog signup, install guide'], ['needs', 'The operator says when to continue with the remaining pages']],
        tail: [
            u([
                'Use exactly this wording for the notice, it came from the lawyer by phone and I have it nowhere else, do not rephrase it:',
                '',
                '"We keep the email address you enter here for 13 months after your last sign-in, then delete it. Write to privacy@tidewater.test to have it removed sooner."',
                '',
                'Start with the landing page and the footer, then stop so I can look at it.',
            ].join('\n')),
            edit('layouts/footer.html'), edit('content/terms.md'), sh('npm run build'),
            a('The notice is on the landing page and in the footer, with your wording unchanged, and the build passes. I have stopped here as you asked. Three pages are left (pricing, changelog signup, install guide); tell me when to continue.'),
        ],
        answers: sides({ closes_request: 'true', needs_verbatim: 'true' }), verdict: 'wait',
        evidence: [{ question: 'needs_verbatim', field: 'recent_turns', quote: 'for 13 months after your last sign-in' }, { question: 'needs_verbatim', field: 'recent_turns', quote: 'I have it nowhere else' }, { question: 'closes_request', field: 'last_reply', quote: 'I have stopped here as you asked' }],
        note: 'The prompt asked for two pages and a stop, which the reply delivers. The remaining pages need the dictated wording, which the operator says exists nowhere else; open_work does not carry it.',
    },
    {
        id: 'md-20-just-compacted-resuming', plants: ['just-compacted', 'mid-work'], size: 'small', difficulty: 'easy', project: orchard, ageHours: 0, fillerEntries: 0, fillerFacts: 6, extraOpen: 0,
        goal: 'Bring the contract tests of the checkout API back to green',
        open: [['now', 'Rerun the checkout contract tests after the schema fix'], ['next', 'Update the published contract file if the tests pass']],
        tail: [
            u('This session continues from an earlier conversation that was summarised. Brief: the goal is to bring the checkout contract tests back to green. The response schema of POST /checkout/session was fixed in src/checkout/session.ts and committed. Next step: rerun the contract tests, then update the published contract file if they pass. Continue from there without asking.'),
            a('Picking up from the brief. I am rerunning the checkout contract tests now, and I will update the published contract file if they pass.'),
            sh('bun test test/e2e/checkout.test.ts'),
        ],
        answers: sides({ announces_continuation: 'true' }), verdict: 'wait',
        evidence: [{ question: 'announces_continuation', field: 'last_reply', quote: 'I am rerunning the checkout contract tests now' }, { question: 'changes_subject', field: 'goal', quote: 'contract tests of the checkout API' }],
        note: 'The conversation holds only a continuation brief and the first step after it; the agent is mid-work.',
    },
    {
        id: 'md-21-just-compacted-quick-answer', plants: ['just-compacted', 'finished-idle', 'changes-subject'], size: 'small', difficulty: 'medium', project: lantern, ageHours: 0, fillerEntries: 0, fillerFacts: 8, extraOpen: 0,
        goal: 'Audit the icon set and remove duplicates',
        open: [['next', 'Delete the nine unused icons after the next release']],
        tail: [
            u('This session continues from an earlier conversation that was summarised. Brief: the icon audit was delivered and merged in merge request 57. 212 icons exist and 9 are unused; the unused ones are listed in docs/icons/unused.md. Nothing is running.'),
            a('Resumed from the brief. Nothing is running and nothing is pending on my side.'),
            u('Different topic, not about the icons: what does the --frozen-lockfile flag of bun install do?'),
            a('It makes `bun install` fail instead of changing the lockfile: if package.json and the lockfile disagree, the install stops with an error and writes nothing. It is what a pipeline should use.'),
        ],
        answers: sides({ closes_request: 'true', changes_subject: 'true' }), verdict: 'compact',
        evidence: [{ question: 'closes_request', field: 'last_reply', quote: 'fail instead of changing the lockfile' }, { question: 'changes_subject', field: 'last_prompt', quote: 'Different topic, not about the icons' }],
        note: 'Right after a compaction a short unrelated question is answered. The six questions say compact; that a second compaction so soon gains nothing is the share gate\'s business, not the decider\'s, and the state carries no sign of the earlier compaction except the brief text.',
    },
    {
        id: 'md-22-idle-delivered-open-work-left', plants: ['long-idle-unfinished', 'finished-idle'], size: 'medium', difficulty: 'medium', project: kestrel, ageHours: 74, fillerEntries: 20, fillerFacts: 34, extraOpen: 7,
        goal: 'Release kestrel-sync 2.0 with the async transport',
        open: [['next', 'Write the upgrade notes for 2.0'], ['next', 'Tag the release candidate'], ['needs', 'A second device to test the macOS build']],
        tail: [
            u('Give me a status report on the 2.0 release: what is in, what is left.'),
            sh('git log --oneline -5'), sh('cargo test --test sync_roundtrip'),
            a('Status of 2.0. In: the async transport, the conflict resolver that keeps both versions, and the path mapper fix; the round-trip test passes on Linux. Left: the upgrade notes, the release candidate tag, and a test of the macOS build, which needs a second device. All three are on the list; none is started. That is the whole picture as of today.'),
        ],
        answers: sides({ closes_request: 'true' }), verdict: 'compact',
        evidence: [{ question: 'closes_request', field: 'last_reply', quote: 'That is the whole picture as of today' }, { question: 'needs_verbatim', field: 'open_work', quote: 'Write the upgrade notes for 2.0' }],
        note: 'The lane has been idle for three days with unfinished work, but the last request (a status report) was delivered and everything left is in open_work. The state carries no times, so idleness itself is invisible to the decider.',
    },
    {
        id: 'md-23-idle-stopped-blocked', plants: ['long-idle-unfinished', 'stopped-partial'], size: 'medium', difficulty: 'medium', project: pebble, ageHours: 52, fillerEntries: 18, fillerFacts: 30, extraOpen: 3,
        goal: 'Move all five runners to the new secrets broker',
        open: [['now', 'Migrate runners r-03, r-04 and r-05 to the secrets broker'], ['needs', 'A broker token with write access for the remaining three runners']],
        tail: [
            u('Migrate the five runners to the new secrets broker today.'),
            edit('deploy/runners.yaml'), described('Roll out the broker config to r-01'), described('Roll out the broker config to r-02'), described('Roll out the broker config to r-03'),
            a('Two of the five runners are migrated (r-01 and r-02) and both pass their health check. I had to stop at r-03: the token I have is read-only and the broker refuses the registration. I cannot migrate the remaining three without a token that has write access.'),
        ],
        answers: sides({}), verdict: 'wait',
        evidence: [{ question: 'closes_request', field: 'last_reply', quote: 'Two of the five runners are migrated' }, { question: 'announces_continuation', field: 'last_reply', quote: 'I cannot migrate the remaining three without a token' }],
        note: 'Every question is false: a partial result that stops and waits for something only the operator can give. With neither closes_request nor changes_subject true, the verdict is wait.',
    },
    {
        id: 'md-24-idle-stuck-asks-choice', plants: ['long-idle-unfinished', 'stuck', 'stopped-partial', 'detailed-choice'], size: 'large', difficulty: 'medium', project: marrow, ageHours: 96, fillerEntries: 75, fillerFacts: 120, extraOpen: 5,
        goal: 'Restore the archived orders table into the new cluster',
        open: [['now', 'Restore archive part 7 of 9 of the orders table'], ['next', 'Verify row counts of the restored orders table against the archive manifest']],
        tail: [
            u('Parts 1 to 6 are in. Restore the remaining parts of the orders archive.'),
            sh('python -m restore.apply --part 7'),
            a('Part 7 failed: `ChecksumMismatch: block 1183 expected 5be0c2a1 got 00000000`. I am downloading the part again and retrying.'),
            sh('python -m restore.apply --part 7'),
            a('Part 7 failed again after a fresh download, with the same `ChecksumMismatch` on block 1183. Retrying with verification of the download first.'),
            sh('python -m restore.apply --part 7'),
            a('The restore of part 7 failed a third time with the same checksum error on block 1183; the downloaded file verifies, so the archive itself looks damaged at that block. I have stopped. There are two ways forward and I need you to pick one: (1) skip block 1183 and restore part 7 without its 4096 rows, which the row-count check will then report as missing; (2) fetch the off-site copy of part 7 from the cold store, which takes about two days and costs a retrieval fee. Which one?'),
        ],
        answers: sides({ stuck: 'true', asks_detailed_choice: 'true', needs_verbatim: 'open' }), verdict: 'wait',
        evidence: [{ question: 'stuck', field: 'recent_turns', quote: 'failed a third time with the same checksum error on block 1183' }, { question: 'announces_continuation', field: 'last_reply', quote: 'I have stopped' }, { question: 'asks_detailed_choice', field: 'last_reply', quote: 'fetch the off-site copy of part 7 from the cold store' }],
        note: 'The same step failed three times and the agent stopped on a choice between two ways forward described only in the reply; the lane then sat idle for four days. Whether the block number and checksum are needed verbatim is left open.',
    },
];

const lines = cases.map((item, index) => {
    const random = seeded(1000 + index);
    const endAt = BASE + index * HOUR - item.ageHours * HOUR;
    const recent = stamped([...fillerEntries(item.project, item.fillerEntries, random), ...item.tail], endAt, random);
    const startAt = endAt - 40 * HOUR;
    const filler = fillerFacts(item.project, item.fillerFacts, startAt, random);
    const extra = Array.from({ length: item.extraOpen }, (_, extraIndex) => fact('next', fill(OPEN_FILL[extraIndex % OPEN_FILL.length] as string, item.project, random), endAt - (extraIndex + 1) * HOUR));
    const goal = item.goal === null ? [] : [fact('goal', item.goal, startAt)];
    const open = item.open.map(([section, text], openIndex) => fact(section, text, endAt - HOUR + openIndex * 60000));
    const half = Math.floor(filler.length / 2);
    const history = [...filler.slice(0, half), ...goal, ...open, ...filler.slice(half), ...extra];
    return JSON.stringify({
        id: item.id,
        plants: item.plants,
        tags: [`size:${item.size}`, `difficulty:${item.difficulty}`, `project:${item.project.name}`, `verdict:${item.verdict}`],
        input: { recent, history },
        expected: { answers: item.answers, verdict: item.verdict, evidence: item.evidence, note: item.note },
    });
});

writeFileSync(join(import.meta.dirname, 'dataset.jsonl'), `${lines.join('\n')}\n`);
console.log(`${lines.length} items written`);
