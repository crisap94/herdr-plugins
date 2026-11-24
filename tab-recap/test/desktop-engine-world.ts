import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import type { FsPath } from '#src/recap/domain/fs-path.ts';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStoreAt, type Store } from '#src/adapters/db/database.ts';
import { desktopFrontend } from '#src/adapters/desktop/frontend.ts';
import { must } from '@stateforge-labs/session-ledger';
import { parseSocketPath } from '#src/adapters/herdr-core/sdk-core.ts';
import type { Operation } from '@stateforge-labs/session-ledger';
import { cursor, recordOps } from '#test/db/support.ts';
import { instant } from '@stateforge-labs/session-ledger';
import { tabId } from '#test/support/ids.ts';
import { textOf } from '@stateforge-labs/session-ledger';
import { usdOf } from '@stateforge-labs/session-ledger';
import { paneIdOf, tabIdOf } from '@stateforge-labs/session-ledger';
import { viewRecord } from '#test/support/tab-view-records.ts';

export const OTHER_TAB = 'w2:t9';
export const OTHER_PANE = 'w2:p9';

export const TAB = 'w1:t1';
export const TASK = { scope: tabIdOf(TAB), key: textOf('t1') };
export const PANE = 'w1:p1';

const DEAD_SOCKET = must(parseSocketPath(join(mkdtempSync(join(tmpdir(), 'tr-core-')), 'none.sock')));

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export interface World {
    readonly root: string;
    readonly store: Store;
    readonly wrapped: Store;
    readonly port: number;
    readonly token: string;
    close(): void;
}

export interface Answer {
    readonly status: number;
    readonly body: unknown;
}

export const add = (section: 'now' | 'needs' | 'goal' | 'decisions' | 'next' | 'rules', text: string, at: number | null = null): Operation => ({ op: 'add', section, text: textOf(text), why: null, ref: null, at: at === null ? null : instant(at), agent: null });

export async function startWorld(): Promise<World> {
    const root = mkdtempSync(join(tmpdir(), 'desktop-engine-'));
    process.env['TAB_RECAP_STATE'] = root;
    delete process.env['TAB_RECAP_API'];
    const opened = openStoreAt(join(root, 'tab-recap.db') as FsPath);
    if (opened.kind !== 'ready') { throw new Error('store'); }
    const wrapped = desktopFrontend(DEAD_SOCKET).wrap(opened, () => undefined, () => Promise.resolve());
    const path = join(root, 'gui', 'api.json');
    for (let n = 0; n < 100 && !existsSync(path); n += 1) { await sleep(20); }
    const found = JSON.parse(readFileSync(path, 'utf8'));
    return { root, store: opened, wrapped, port: found.port, token: found.token, close: (): void => { wrapped.close(); } };
}

export function seedRun(world: World, at: number, ops: readonly Operation[]): void {
    recordOps(world.wrapped, { scope: tabId(TAB), at: instant(at), cause: 'requested', backend: textOf('claude'), language: textOf('en'), costUsd: usdOf(0), error: null, sessions: [cursor(PANE)], tasks: [{ id: textOf('t1'), name: textOf('Login'), sessions: [paneIdOf(PANE)] }], ops: [{ task: textOf('t1'), ops }] });
    world.wrapped.views.writeTab(viewRecord({ tab: TAB, column: null, at, lanes: [{ pane: PANE, agent: 'claude', status: 'idle', title: 'login', cwd: '/repo' }] }));
}

export async function api(world: World, method: string, path: string, token: string | null = world.token): Promise<Answer> {
    const reply = await fetch(`http://127.0.0.1:${world.port}${path}`, { method, headers: token === null ? {} : { authorization: `Bearer ${token}` } });
    return { status: reply.status, body: await reply.json() };
}

export async function seqOf(world: World): Promise<number> {
    return ((await api(world, 'GET', '/v1/health')).body as { seq: number }).seq;
}

export function seedOther(world: World, ops: readonly Operation[]): void {
    recordOps(world.wrapped, { scope: tabId(OTHER_TAB), at: instant(Date.now() - 30_000), cause: 'requested', backend: textOf('claude'), language: textOf('en'), costUsd: usdOf(0), error: null, sessions: [cursor(OTHER_PANE)], tasks: [{ id: textOf('t9'), name: textOf('Other'), sessions: [paneIdOf(OTHER_PANE)] }], ops: [{ task: textOf('t9'), ops }] });
    world.wrapped.views.writeTab(viewRecord({ tab: OTHER_TAB, column: null, at: Date.now(), lanes: [{ pane: OTHER_PANE, agent: 'claude', status: 'idle', title: 'other', cwd: '/repo' }] }));
}
