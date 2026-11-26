import { spawn } from 'node:child_process';
import { accessSync, constants, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { brand, gateName, instant, textOf, usdOf, type Directory, type GateStats } from '@stateforge-labs/session-ledger';
import { databaseFile, openStoreAt, type Store } from '#src/adapters/db/database.ts';
import { openDatabase } from '#src/adapters/db/open.ts';
import { ids } from '#src/adapters/db/uuid7.ts';
import { fsPathOf } from '#src/recap/domain/fs-path.ts';
import { cursor, recordOps } from '#test/db/support.ts';
import { scratch } from '#test/fixtures/git-repo.ts';
import { BUN_CACHE_OFF } from '#test/support/bun-env.ts';
import { tabId } from '#test/support/ids.ts';
import { oneTask, withFacts } from '#test/support.ts';
import type { Ran } from './daemon-world.ts';

const PLUGIN = join(import.meta.dirname, '..', '..', '..');
const COMMAND_ENTRY = join(PLUGIN, 'bin', 'tab-recap.mjs');
const FAKE_MODEL = join(import.meta.dirname, 'fake-judge.sh');
const TOOLS = ['sh', 'cat', 'grep'];
const FORBIDDEN = ['herdr', 'hc', 'claude', 'codex', 'opencode'];
const WITHIN = 25_000;

const GATE_STATS: GateStats = { refused: { [gateName('G1')]: brand<number, 'Count'>(1) }, flagged: { [gateName('G8')]: brand<number, 'Count'>(2) }, dropped: brand<number, 'Count'>(0) };

export const DAY = 86_400_000;

export const SECTIONS = { goal: textOf('Ship retries'), now: [], needs: [], done: [textOf('Merged !256.'), textOf('Worked on it.')], decisions: [], next: [], links: [], rules: [] };

export const KEYS = ['t1/goal/0', 't1/done/0', 't1/done/1'];

export const scoreAnswer = (failing: readonly string[] = ['t1/done/1:I3']): string => JSON.stringify({
    verdicts: KEYS.flatMap((item) => ['I1', 'I2', 'I3', 'I4', 'I5', 'I6', 'I7', item.includes('goal') ? 'S-goal' : 'S-done'].map((check) => {
        const fails = failing.includes(`${item}:${check}`);
        return { item, check, pass: !fails, critique: fails ? 'names nothing concrete' : '' };
    })),
    keyfacts: ['!256 is merged'], coverage: [{ keyfact: 0, item: 'state/t1/done/0' }],
});

export const ANSWERS = JSON.stringify({ answers: ['a', 'b', 'c', 'd', 'e', 'f'] });
export const GRADES = JSON.stringify({ grades: [1, 2, 3, 4, 5, 6].map((question) => ({ question, pass: true, critique: '' })) });

export interface ImportedChapter {
    readonly at: number;
    readonly texts: readonly string[];
}

export interface SeedOver {
    readonly tab?: string;
    readonly daysAgo?: number;
    readonly input?: boolean;
    readonly gate?: boolean;
}

export interface EvalWorld {
    readonly root: string;
    readonly state: string;
    readonly home: string;
    readonly answers: string;
    run(args: readonly string[], more?: { readonly input?: string; readonly env?: Readonly<Record<string, string>>; readonly script?: string; readonly cwd?: string }): Promise<Ran>;
    seed(count: number, over?: SeedOver): void;
    answer(name: string, text: string): void;
    asked(): string[];
    forget(): void;
    seen(task: string, call?: number): string;
    sql(statement: string): readonly Record<string, unknown>[];
    withStore<T>(use: (store: Store) => T): T;
    write(relative: string, text: string): string;
    importChapters(tab: string, chapters: readonly ImportedChapter[]): void;
    close(): void;
}

function findOnPath(name: string): string | null {
    for (const directory of (process.env['PATH'] ?? '').split(delimiter)) {
        const candidate = join(directory, name);
        try {
            accessSync(candidate, constants.X_OK);
            return candidate;
        } catch { }
    }
    return null;
}

function toolsDirectory(root: string): string {
    const bin = join(root, 'bin');
    mkdirSync(bin, { recursive: true });
    for (const name of TOOLS) {
        const found = findOnPath(name);
        if (found !== null) {
            symlinkSync(found, join(bin, name));
        }
    }
    for (const name of FORBIDDEN) {
        if (findOnPathIn(bin, name)) {
            throw new Error(`the world's PATH must not resolve ${name}`);
        }
    }
    return bin;
}

function findOnPathIn(directory: string, name: string): boolean {
    try {
        accessSync(join(directory, name), constants.X_OK);
        return true;
    } catch {
        return false;
    }
}

export function evalWorld(options: { readonly judge?: 'fake' | 'none' } = {}): EvalWorld {
    const fixture = scratch('tab-recap-eval-e2e-');
    const root = fixture.root;
    const state = join(root, 'state');
    const home = join(root, 'home');
    const answers = join(root, 'answers');
    for (const directory of [state, join(root, 'config'), home, answers]) {
        mkdirSync(directory, { recursive: true });
    }
    const fresh = openStoreAt(databaseFile(state as Directory));
    if (fresh.kind === 'ready') {
        fresh.close();
    }
    const base: Record<string, string> = {
        PATH: toolsDirectory(root), HOME: home, XDG_CONFIG_HOME: join(home, 'config'), XDG_STATE_HOME: join(home, 'state'), XDG_DATA_HOME: join(home, 'data'), XDG_CACHE_HOME: join(home, 'cache'),
        HERDR_PLUGIN_CONFIG_DIR: join(root, 'config'), HERDR_PLUGIN_STATE_DIR: state, TAB_RECAP_STATE: state, TAB_RECAP_LOCALE: 'en',
        ...(options.judge === 'none' ? {} : { TAB_RECAP_BACKEND: 'custom', TAB_RECAP_CUSTOM_CMD: `${FAKE_MODEL} ${answers}` }),
        ...BUN_CACHE_OFF,
    };

    const run: EvalWorld['run'] = async (args, more = {}) => {
        const entry = more.script ?? COMMAND_ENTRY;
        const child = spawn(process.execPath, [entry, ...args], { cwd: more.cwd ?? PLUGIN, env: { ...base, ...more.env }, stdio: ['pipe', 'pipe', 'pipe'] });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
        child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
        child.stdin.on('error', () => undefined);
        child.stdin.end(more.input ?? '');
        const timer = setTimeout(() => { child.kill('SIGKILL'); }, WITHIN);
        const code = await new Promise<number | null>((resolve) => { child.on('close', resolve); });
        clearTimeout(timer);
        return { code, stdout, stderr };
    };

    const seed: EvalWorld['seed'] = (count, over = {}) => {
        const store = openStoreAt(databaseFile(state as Directory));
        if (store.kind !== 'ready') {
            throw new Error('the world store did not open');
        }
        const first = Date.now() - (over.daysAgo ?? 1) * DAY;
        for (let n = 0; n < count; n += 1) {
            recordOps(store, {
                scope: tabId(over.tab ?? 'w1:t1'), at: instant(first + n * 1000), cause: 'requested', backend: textOf('fake'), language: textOf('en'), costUsd: usdOf(0), error: null, sessions: [cursor('w1:p1')],
                ...withFacts(oneTask('', { ...SECTIONS, goal: textOf(`Ship retries ${n}`) })), ...(over.input === false ? {} : { input: textOf(`<recap_input version="1">run ${n}</recap_input>`) }),
                ...(over.gate === true ? { gateStats: GATE_STATS } : {}),
            });
        }
        store.close();
    };

    const withStore = <T>(use: (store: Store) => T): T => {
        const store = openStoreAt(databaseFile(state as Directory));
        if (store.kind !== 'ready') {
            throw new Error('the world store did not open');
        }
        try {
            return use(store);
        } finally {
            store.close();
        }
    };

    const sql: EvalWorld['sql'] = (statement) => {
        const store = openStoreAt(databaseFile(state as Directory));
        if (store.kind !== 'ready') {
            throw new Error('the world store did not open');
        }
        try {
            return store.db.prepare(statement).all().map((row) => Object.assign({}, row));
        } finally {
            store.close();
        }
    };

    const importChapters: EvalWorld['importChapters'] = (tab, chapters) => {
        const opened = openDatabase(fsPathOf(databaseFile(state as Directory)));
        if (opened.kind !== 'ready') {
            throw new Error('the world database did not open');
        }
        const { db } = opened;
        try {
            db.prepare('INSERT INTO tab (id, first_seen, last_seen) VALUES (?, 1, 1)').run(tab);
            const task = ids.next();
            db.prepare('INSERT INTO task (id, tab_id, key) VALUES (?, ?, ?)').run(task, tab, 't1');
            chapters.forEach((chapter, index) => {
                const id = ids.next();
                const recap = ids.next();
                db.prepare('INSERT INTO chapter (id, tab_id, n, started_at) VALUES (?, ?, ?, ?)').run(id, tab, index + 1, index + 1);
                db.prepare("INSERT INTO run (id, chapter_id, at, cause, backend, language, cost_micro_usd, error) VALUES (?, ?, ?, 'turn-ended', 'claude', 'en', 0, NULL)").run(recap, id, chapter.at);
                db.prepare('INSERT INTO run_task (run_id, task_id, position) VALUES (?, ?, 0)').run(recap, task);
                chapter.texts.forEach((text, position) => {
                    db.prepare("INSERT INTO item (run_id, task_id, view, section, position, text) VALUES (?, ?, 'recap', 'done', ?, ?)").run(recap, task, position, text);
                });
            });
        } finally {
            db.close();
        }
    };

    return {
        root, state, importChapters, home, answers, run, seed, sql, withStore,
        answer: (name, text) => { writeFileSync(join(answers, name), text); },
        asked: () => { try { return readFileSync(join(answers, 'asked.log'), 'utf8').split('\n').filter((line) => line !== ''); } catch { return []; } },
        forget: () => { writeFileSync(join(answers, 'asked.log'), ''); },
        seen: (task, call = 1) => readFileSync(join(answers, `doc.${task}.${call}`), 'utf8'),
        write: (relative, text) => { const path = join(root, relative); mkdirSync(join(path, '..'), { recursive: true }); writeFileSync(path, text); return path; },
        close: () => { fixture.clean(); },
    };
}

export function judgingWorld(): EvalWorld {
    const world = evalWorld();
    world.answer('score', scoreAnswer());
    world.answer('readback', ANSWERS);
    world.answer('grade', GRADES);
    return world;
}
