import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore, type Store } from '#src/adapters/db/database.ts';
import { desktopFrontend } from '#src/adapters/desktop-frontend.ts';
import { must } from '#src/protocol/result.ts';
import { parseSocketPath } from '#src/adapters/herdr-core/sdk-core.ts';
import type { Operation } from '#src/recap/domain/ops.ts';
import { cursor } from '#test/db/support.ts';

export const OTHER_TAB = 'w2:t9';
export const OTHER_PANE = 'w2:p9';

export const TAB = 'w1:t1';
export const TASK = { tab: TAB, key: 't1' };
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

export const add = (section: 'now' | 'needs' | 'goal' | 'decisions' | 'next' | 'rules', text: string, at: number | null = null): Operation => ({ op: 'add', section, text, why: null, ref: null, at, agent: null });

export async function startWorld(): Promise<World> {
    const root = mkdtempSync(join(tmpdir(), 'desktop-engine-'));
    process.env['TAB_RECAP_STATE'] = root;
    delete process.env['TAB_RECAP_API'];
    const opened = openStore(join(root, 'tab-recap.db'));
    if (opened.kind !== 'ready') { throw new Error('store'); }
    const wrapped = desktopFrontend(DEAD_SOCKET).wrap(opened, () => undefined);
    const path = join(root, 'gui', 'api.json');
    for (let n = 0; n < 100 && !existsSync(path); n += 1) { await sleep(20); }
    const found = JSON.parse(readFileSync(path, 'utf8'));
    return { root, store: opened, wrapped, port: found.port, token: found.token, close: (): void => { wrapped.close(); } };
}

export function seedRun(world: World, at: number, ops: readonly Operation[]): void {
    world.wrapped.records.recordRun({ tab: TAB, at, cause: 'requested', backend: 'claude', language: 'en', costUsd: 0, error: null, lanes: [cursor(PANE)], tasks: [{ id: 't1', name: 'Login', lanes: [PANE] }], ops: [{ task: 't1', ops }] });
    world.wrapped.views.writeTab({ tab: TAB, column: null, at, lanes: [{ pane: PANE, agent: 'claude', status: 'idle', title: 'login', cwd: '/repo' }] });
}

export async function api(world: World, method: string, path: string, token: string | null = world.token): Promise<Answer> {
    const reply = await fetch(`http://127.0.0.1:${world.port}${path}`, { method, headers: token === null ? {} : { authorization: `Bearer ${token}` } });
    return { status: reply.status, body: await reply.json() };
}

export async function seqOf(world: World): Promise<number> {
    return ((await api(world, 'GET', '/v1/health')).body as { seq: number }).seq;
}

export function seedOther(world: World, ops: readonly Operation[]): void {
    world.wrapped.records.recordRun({ tab: OTHER_TAB, at: Date.now() - 30_000, cause: 'requested', backend: 'claude', language: 'en', costUsd: 0, error: null, lanes: [cursor(OTHER_PANE)], tasks: [{ id: 't9', name: 'Other', lanes: [OTHER_PANE] }], ops: [{ task: 't9', ops }] });
    world.wrapped.views.writeTab({ tab: OTHER_TAB, column: null, at: Date.now(), lanes: [{ pane: OTHER_PANE, agent: 'claude', status: 'idle', title: 'other', cwd: '/repo' }] });
}
