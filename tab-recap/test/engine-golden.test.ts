import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ClaudeTranscripts } from '#src/adapters/transcripts/claude/transcripts.ts';
import { scratchStore } from '#src/adapters/db/scratch.ts';
import type { Store } from '#src/adapters/db/database.ts';
import { PREFIXES } from '#src/adapters/db/typeid.ts';
import { replay } from '#src/recap/application/replay.ts';
import type { ReplayDeps } from '#src/recap/application/replay.ts';
import { writerContext } from '#src/recap/application/writer-context.ts';
import type { Pipeline } from '#src/recap/domain/pipeline.ts';
import { FULL_WRITER_VIEW } from '#src/recap/domain/writer-view.ts';
import { NO_REPOS } from '#test/support.ts';
import { answer, scripted as scriptedEnumerator } from '#test/fakes/enumerator.ts';
import { writer } from '#test/fakes/golden-writer.ts';

const FILE = join(import.meta.dirname, 'fixtures', 'replay-claude.jsonl');
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

function ledgerOf(store: Store): string {
    const runs = store.inputs.runs({ tab: LABEL, since: null, limit: 100, withInput: true }).toReversed();
    const parts = runs.map((run, at) => {
        const { id, ...kept } = run;
        return [
            section(`run ${at + 1}`, json(kept)),
            section(`run ${at + 1} stored document`, store.inputs.document(id) ?? '(none)'),
            section(`run ${at + 1} added items`, json(store.inputs.itemsOf(id, 'added'))),
            section(`run ${at + 1} state items`, json(store.inputs.itemsOf(id, 'state'))),
        ].join('');
    });
    const recap = store.records.readRecap(LABEL);
    const facts = (recap?.tasks ?? []).flatMap((task) => store.ledger.allOf({ tab: LABEL, key: task.id }));
    return [...parts, section('recap', json(recap)), section('last run', json(store.records.lastRunOf(LABEL))), section('facts', json(facts))].join('');
}

async function golden(pipeline: Pipeline | undefined): Promise<string> {
    const { summarizer, seen } = writer();
    const enumerating = scriptedEnumerator([candidateFor]);
    const scratch = scratchStore();
    try {
        const deps: ReplayDeps = { reader: new ClaudeTranscripts(), summarizer: () => summarizer, records: scratch.store.records, ledger: scratch.store.ledger, repos: NO_REPOS, language: 'en', log: () => undefined, enumerator: () => enumerating.enumerator, ...(pipeline === undefined ? {} : { pipeline }), writerView: FULL_WRITER_VIEW };
        const done = await replay(deps, FILE, LABEL, statSync(FILE).size);
        const header = section('replayed', json({ windows: done.windows, turns: done.turns, costUsd: done.costUsd, writerCalls: seen.length, enumerationCalls: enumerating.documents.length }));
        const written = seen.map((request, at) => section(`writer input ${at + 1} (language ${request.language}, previous ${request.previousLanguage}, retry ${request.retry === undefined ? 'no' : 'yes'})`, writerContext(request))).join('');
        const enumerated = enumerating.documents.map((document, at) => section(`enumeration input ${at + 1}`, document)).join('');
        return stable(`${header}${written}${enumerated}${ledgerOf(scratch.store)}`);
    } finally {
        scratch.dispose();
    }
}

function matches(name: string, text: string): void {
    const path = join(import.meta.dirname, 'fixtures', name);
    if (process.env['UPDATE_GOLDEN'] === '1') {
        writeFileSync(path, text);
    }
    assert.ok(existsSync(path), `the golden fixture ${name} is committed; UPDATE_GOLDEN=1 is the only way to write it`);
    assert.equal(text, readFileSync(path, 'utf8'));
}

test('the golden bytes are taken in UTC, the zone bun test runs in, so the local times in the documents do not move between machines', () => {
    assert.equal(Intl.DateTimeFormat().resolvedOptions().timeZone, 'UTC');
});

test('golden: the six-turn replay on the single-call pipeline hands the writer the same documents and leaves the same ledger and runs', async () => {
    const text = await golden(undefined);
    assert.ok(text.includes('=== writer input 6'), 'every turn reaches the writer');
    matches('engine-golden-one.txt', text);
});

test('golden: the six-turn replay on the full pipeline enumerates every turn, hands the writer the same documents and leaves the same ledger and runs', async () => {
    const text = await golden('full');
    assert.ok(text.includes('=== enumeration input 6'), 'every turn is enumerated');
    matches('engine-golden-full.txt', text);
});

test('golden: two replays of the same transcript give the same bytes', async () => {
    assert.equal(await golden('full'), await golden('full'));
});
