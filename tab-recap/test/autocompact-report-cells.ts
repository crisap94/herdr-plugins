import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const QUESTIONS = ['closes_request', 'announces_continuation', 'asks_detailed_choice', 'needs_verbatim', 'changes_subject', 'stuck'];

const point = (id: string, share: number): object => ({
    id, tab: 't', pane: '1-1', at: 1_000, source: '/s.jsonl', cursor: 0, transcript: 'AB', stratum: 'cold',
    share, tokens: null, window: null, inFlight: 'unknown', lastBreakAt: null, gate: 'ask',
    state: { last_prompt: null, last_reply: null, recent_turns: [], goal: null, open_work: [] },
    recent: [], history: [], hindsight: { next_prompt: null, following: [] },
});

const labelOf = (question: string, unsafe: boolean): number => {
    if (question === 'needs_verbatim') return Number(unsafe);
    return Number(question === 'closes_request');
};
const labelsOf = (unsafe: boolean): Record<string, number> => Object.fromEntries(QUESTIONS.map((q) => [q, labelOf(q, unsafe)]));
const answerOf = (key: string, close: number): object => ({ key, kind: 'point', answers: Object.fromEntries(QUESTIONS.map((q) => [q, q === 'closes_request' ? close : 0.1])), tokens: 10, costUsd: 0.01, tookMs: 100 });
const lines = (rows: readonly object[]): string => `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`;

export function writeFixture(): string {
    const dir = mkdtempSync(join(tmpdir(), 'autocompact-report-'));
    const ids = ['a', 'b', 'c', 'd'];
    writeFileSync(join(dir, 'corpus.jsonl'), lines(ids.map((id, i) => point(id, 30 + i * 15))));
    writeFileSync(join(dir, 'labels.jsonl'), lines(ids.map((id, i) => ({ id, labels: labelsOf(i % 2 === 1) }))));
    writeFileSync(join(dir, 'answers-jev-1.jsonl'), lines([answerOf('a', 0.9), answerOf('b', 0.9), answerOf('c', 0.9), answerOf('d', 0.2)]));
    writeFileSync(join(dir, 'answers-jev-2.jsonl'), lines([answerOf('a', 0.9), answerOf('b', 0.9), answerOf('c', 0.2), answerOf('d', 0.2)]));
    return dir;
}

export const removeFixture = (dir: string): void => rmSync(dir, { recursive: true, force: true });
