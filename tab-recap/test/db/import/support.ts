// Old-layout state directories for the import tests: one writer per historical shape of a file.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileKey } from '#src/adapters/db/import/legacy-files.ts';
import { renderRecap } from '#src/recap/application/recap-shape.ts';

export const sections = { goal: 'ship', now: ['a'], needs: ['review'], done: ['b', 'c'], decisions: ['sqlite'], next: ['n'], links: ['x.ts'] };
export const lane = { pane: 'w1:p1', agent: 'claude', transcript: '/t/a.jsonl', cursor: 120, tail: null, title: 'T', lastPrompt: 'p', claudeRecap: null };
const base = { running: false, backend: 'claude', error: null, costUsd: 0.12, language: 'en' };

export function put(root: string, kind: string, name: string, body: unknown): void {
    mkdirSync(join(root, kind), { recursive: true });
    writeFileSync(join(root, kind, name), typeof body === 'string' ? body : JSON.stringify(body));
}

/** One of each shape a recap or a view was ever stored in. */
export function everyShape(root: string): void {
    const recap = (tab: string, body: object): void => { put(root, 'recaps', `${fileKey(tab)}.json`, { tab, ...body }); };
    recap('w1:t1', { ...base, lanes: [lane], at: 1000, tasks: [{ id: 't1', name: '', lanes: ['w1:p1'], sections, markdown: renderRecap(sections, 'en') }] });
    recap('w1:t2', { ...base, lanes: [lane], at: 1000, markdown: '## Goal\n- from the old days', language: undefined });
    recap('w1:t3', { ...base, lanes: [lane], at: 1000, sections, markdown: renderRecap(sections, 'en') });
    const { tail: _tail, ...noTail } = lane;
    recap('w1:t4', { ...base, lanes: [{ ...noTail, pane: 'w1:p4' }], at: 1000, tasks: [{ id: 't1', name: 'Docs', lanes: ['w1:p4'], sections: null, markdown: '## Goal\n- markdown only' }, { id: 't2', name: 'Pay', lanes: ['w1:p5'], sections, markdown: renderRecap(sections, 'es') }], language: 'es' });
    recap('w1:t5', { ...base, lanes: [{ ...lane, pane: 'w1:p6', transcript: 'screen:w1:p6', tail: 'abc' }], at: null, error: 'the writer failed', costUsd: 0.5, tasks: [] });
    recap('w1:t6', { ...base, lanes: [lane], at: 2000, running: true, error: 'w1:p2: no reader', tasks: [{ id: 't1', name: '', lanes: ['w1:p1', 'w1:p2'], sections, markdown: renderRecap(sections, 'en') }] });
    recap('w1:t7', { ...base, lanes: [], at: null, tasks: [], costUsd: 0, backend: null });
    put(root, 'tabs', `${fileKey('w1:t1')}.json`, { tab: 'w1:t1', column: 'w1:p9', at: 5, daemonVersion: '1.5.1', lanes: [{ pane: 'w1:p1', agent: 'claude', status: 'idle', title: 'T', cwd: '/w', lastPrompt: 'ship it' }] });
    put(root, 'tabs', `${fileKey('w1:t2')}.json`, { tab: 'w1:t2', column: null, at: 6, lanes: [{ pane: 'w1:p1', agent: 'claude', status: 'working', title: null }] });
    put(root, 'tabs', `${fileKey('w1:t8')}.json`, { tab: 'w1:t8', column: null, at: 7 });
    put(root, '', 'hidden.json', { all: true, hidden: ['w1:t1', 'w1:t9'], shown: ['w1:t2'] });
    put(root, 'requests', fileKey('w1:t1'), 'w1:t1');
    put(root, 'visibility', '000000000000001-1-1.json', { target: 'w1:t1', hidden: 'toggle' });
    put(root, 'visibility', '000000000000002-1-2.json', { target: 'all', hidden: true });
}
