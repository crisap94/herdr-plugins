import { runsOf, storeRead } from '#test/db/support.ts';
import type { RunEntry, RunRecord } from '#src/ports/run-inputs.ts';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ClaudeTranscripts } from '#src/adapters/transcripts/claude/transcripts.ts';
import { scratchStore } from '#src/adapters/db/scratch.ts';
import type { Store } from '#src/adapters/db/database.ts';
import { brand } from '@stateforge-labs/session-ledger';
import type { Fact, LegacyWriter as Writer, Recap, RecapRequest, RecapTask, SessionCursor, Written, WriterView } from '@stateforge-labs/session-ledger';
import { PREFIXES } from '#src/adapters/db/typeid.ts';
import { replayFile } from '#src/recap/application/replay.ts';
import type { Replayed, TypedReplayDeps } from '#src/recap/application/replay.ts';
import { writerContext } from '@stateforge-labs/session-ledger';
import type { Pipeline } from '@stateforge-labs/session-ledger';
import { FULL_WRITER_VIEW } from '@stateforge-labs/session-ledger';
import { NO_REPOS } from '#test/support.ts';
import { answer, scripted as scriptedEnumerator, type Reply } from '#test/fakes/enumerator.ts';
import { writer } from '#test/fakes/golden-writer.ts';
import { mintFactId } from '#src/adapters/db/ledger-rows.ts';
import { tabId } from '#test/support/ids.ts';
import { tabIdOf } from '#src/recap/domain/ids.ts';
import { textOf } from '@stateforge-labs/session-ledger';
import { must } from '@stateforge-labs/session-ledger';
import { countOf, parsePositiveCount } from '@stateforge-labs/session-ledger';
import { parseSessionPath } from '#src/recap/domain/ids.ts';

export const FILE = join(import.meta.dirname, '..', '..', 'fixtures', 'replay-claude.jsonl');
const LABEL = 'replay:t1';
const NUMBERS = ['one', 'two', 'three', 'four', 'five', 'six'];
const candidateFor = (document: string, call: number): string => answer([{ section: 'done', text: `Candidate number ${NUMBERS[call - 1] ?? 'more'}`, anchor: /<turn[^>]*>([^<.]{8,60})/.exec(document)?.[1] ?? '' }]);

const ID_PATTERN = new RegExp(`\\b(${Object.values(PREFIXES).join('|')})_[0-9a-z]{26}\\b`, 'g');

function stable(text: string): string {
    const seen = new Map<string, string>();
    return text.replaceAll(FILE, '<fixtures>/replay-claude.jsonl').replace(ID_PATTERN, (id: string, prefix: string) => {
        const known = seen.get(id) ?? `${prefix}_#${[...seen.keys()].filter((each) => each.startsWith(`${prefix}_`)).length + 1}`;
        seen.set(id, known);
        return known;
    });
}

const section = (title: string, body: string): string => `=== ${title}\n${body}\n`;
const json = (value: unknown): string => JSON.stringify(value, null, 2);

const cursorPrint = (cursor: SessionCursor): object => ({ pane: cursor.key, agent: cursor.agent, transcript: cursor.transcript, cursor: cursor.cursor, tail: cursor.tail, title: cursor.title, lastPrompt: cursor.lastPrompt, claudeRecap: cursor.harnessRecap });

const taskPrint = ({ sessions, ...task }: RecapTask): object => ({ id: task.id, name: task.name, lanes: sessions, sections: task.sections, markdown: task.markdown });

const recapPrint = (recap: Recap | null): object | null => recap === null ? null : { tab: recap.scope, lanes: recap.sessions.map(cursorPrint), tasks: recap.tasks.map(taskPrint), at: recap.at, running: recap.running, backend: recap.backend, error: recap.error, costUsd: recap.costUsd, language: recap.language };

const factPrint = (fact: Fact): object => ({ ...fact, task: { tab: fact.task.scope, key: fact.task.key } });

const storedShape = (rest: Omit<RunRecord, 'id' | 'input'>, input: RunRecord['input']): object => ({ tab: rest.tab, at: rest.at, language: rest.language, backend: rest.backend, hasInput: input === 'present', gateStats: rest.gateStats });

const itemShape = (entry: RunEntry): object => ({ key: entry.key, section: entry.section, text: entry.text, fact: entry.fact, born: entry.birth === 'born', anchor: entry.anchor });

function ledgerOf(store: Store): string {
    const runs = runsOf(store.inputs, { tab: LABEL, since: null, limit: 100, withInput: true }).toReversed();
    const parts = runs.map((run, at) => {
        const { id, input, ...rest } = run;
        const kept = storedShape(rest, input);
        return [
            section(`run ${at + 1}`, json(kept)),
            section(`run ${at + 1} stored document`, store.inputs.document(id) ?? '(none)'),
            section(`run ${at + 1} added items`, json(store.inputs.itemsOf(id, 'added').map(itemShape))),
            section(`run ${at + 1} state items`, json(store.inputs.itemsOf(id, 'state').map(itemShape))),
        ].join('');
    });
    const recap = storeRead(store.records.readRecap(tabId(LABEL)));
    const facts = (recap?.tasks ?? []).flatMap((task) => storeRead(store.ledger.allOf({ scope: tabIdOf(LABEL), key: task.id })));
    return [...parts, section('recap', json(recapPrint(recap))), section('last run', json(storeRead(store.records.lastRunOf(tabId(LABEL))))), section('facts', json(facts.map(factPrint)))].join('');
}

export async function golden(pipeline: Pipeline | undefined): Promise<string> {
    const { summarizer, seen } = writer();
    const enumerating = scriptedEnumerator([candidateFor]);
    const scratch = scratchStore();
    try {
        const deps: TypedReplayDeps = { reader: new ClaudeTranscripts(), summarizer: () => summarizer, records: scratch.store.records, ledger: scratch.store.ledger, mint: mintFactId, repos: NO_REPOS, language: textOf('en'), log: () => undefined, enumerator: () => enumerating.enumerator, ...(pipeline === undefined ? {} : { pipeline }), writerView: FULL_WRITER_VIEW };
        const done = await replayFile(deps, must(parseSessionPath(FILE)), tabId(LABEL), countOf(statSync(FILE).size), must(parsePositiveCount(1)));
        const header = section('replayed', json({ windows: done.windows, turns: done.turns, costUsd: done.costUsd, writerCalls: seen.length, enumerationCalls: enumerating.documents.length }));
        const written = seen.map((request, at) => section(`writer input ${at + 1} (language ${request.language}, previous ${request.previousLanguage}, retry ${request.retry === undefined ? 'no' : 'yes'})`, writerContext(request))).join('');
        const enumerated = enumerating.documents.map((document, at) => section(`enumeration input ${at + 1}`, document)).join('');
        return stable(`${header}${written}${enumerated}${ledgerOf(scratch.store)}`);
    } finally {
        scratch.dispose();
    }
}

export function matches(name: string, text: string): void {
    const path = join(import.meta.dirname, '..', '..', 'fixtures', name);
    if (process.env['UPDATE_GOLDEN'] === '1') {
        writeFileSync(path, text);
    }
    assert.ok(existsSync(path), `the golden fixture ${name} is committed; UPDATE_GOLDEN=1 is the only way to write it`);
    assert.equal(text, readFileSync(path, 'utf8'));
}

const TEXTS = ['Wrote the cart schema', 'Opened the checkout flow', 'Tested guests baskets', 'Shipped the invoice export', 'Reviewed pricing rules', 'Merged the tax fix'];

function adding(): { summarizer: Writer; seen: RecapRequest[] } {
    const seen: RecapRequest[] = [];
    const summarizer: Writer = {
        backend: textOf('fake'),
        contract: 'strict',
        write: (request): Promise<Written> => {
            seen.push(request);
            const picked = request.input.candidates?.[0];
            const first = request.input.transcripts[0]?.entries[0]?.text.split(/\s+/).slice(0, 5).join(' ') ?? '';
            const op = picked === undefined ? { op: 'add', anchor: first, section: 'done', text: TEXTS[seen.length - 1] ?? 'More work' } : { op: 'add', anchor: picked.anchor, section: picked.section, text: picked.text };
            return Promise.resolve({ kind: 'written', text: textOf(JSON.stringify({ ops: [op] })), costUsd: brand<number, 'Usd'>(0.25) });
        },
    };
    return { summarizer, seen };
}

export interface Ran {
    readonly done: Replayed;
    readonly seen: RecapRequest[];
    readonly documents: string[];
}

export async function replayRun(pipeline: Pipeline | undefined, writerView: WriterView, mergeTurns?: number): Promise<Ran> {
    const { summarizer, seen } = adding();
    const enumerating = scriptedEnumerator([candidateFor]);
    const scratch = scratchStore();
    try {
        const deps: TypedReplayDeps = { reader: new ClaudeTranscripts(), summarizer: () => summarizer, records: scratch.store.records, ledger: scratch.store.ledger, mint: mintFactId, repos: NO_REPOS, language: textOf('en'), log: () => undefined, enumerator: () => enumerating.enumerator, ...(pipeline === undefined ? {} : { pipeline }), writerView };
        const done = await replayFile(deps, must(parseSessionPath(FILE)), tabId(LABEL), countOf(statSync(FILE).size), must(parsePositiveCount(mergeTurns ?? 1)));
        return { done, seen, documents: enumerating.documents };
    } finally {
        scratch.dispose();
    }
}

export async function replayPath(path: string, pipeline: Pipeline | undefined, replies: readonly Reply[], mergeTurns?: number): Promise<Ran> {
    const { summarizer, seen } = adding();
    const enumerating = scriptedEnumerator(replies);
    const scratch = scratchStore();
    try {
        const deps: TypedReplayDeps = { reader: new ClaudeTranscripts(), summarizer: () => summarizer, records: scratch.store.records, ledger: scratch.store.ledger, mint: mintFactId, repos: NO_REPOS, language: textOf('en'), log: () => undefined, enumerator: () => enumerating.enumerator, ...(pipeline === undefined ? {} : { pipeline }), writerView: FULL_WRITER_VIEW };
        const done = await replayFile(deps, must(parseSessionPath(path)), tabId(LABEL), countOf(statSync(path).size), must(parsePositiveCount(mergeTurns ?? 1)));
        return { done, seen, documents: enumerating.documents };
    } finally {
        scratch.dispose();
    }
}

export interface Turn {
    readonly prompt: string;
    readonly said: readonly string[];
    readonly calls?: readonly { readonly name: string; readonly input: Readonly<Record<string, string>> }[];
}

export function transcriptOf(turns: readonly Turn[]): string {
    const lines: string[] = [];
    let minute = 0;
    const stamp = (): string => new Date(Date.parse('2026-10-07T09:00:00Z') + (minute += 1) * 20_000).toISOString();
    for (const turn of turns) {
        lines.push(JSON.stringify({ type: 'user', timestamp: stamp(), message: { content: turn.prompt } }));
        for (const text of turn.said) {
            lines.push(JSON.stringify({ type: 'assistant', timestamp: stamp(), message: { content: [{ type: 'text', text }] } }));
        }
        for (const call of turn.calls ?? []) {
            lines.push(JSON.stringify({ type: 'assistant', timestamp: stamp(), message: { content: [{ type: 'tool_use', id: `toolu_${minute}`, name: call.name, input: call.input }] } }));
        }
    }
    return `${lines.join('\n')}\n`;
}
