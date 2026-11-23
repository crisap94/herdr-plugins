import { after, test } from 'node:test';
import { deepEqual, equal, ok } from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore } from '@stateforge-labs/session-ledger-sqlite';
import { instant, isUnknown, parseScopeId, UNREAD, type RecapRequest, type Writer } from '@stateforge-labs/session-ledger';
import { count, followed, key, scope, session, text, usd } from '@stateforge-labs/session-ledger/testkit';
import { claudeReader, createLedgerEngine, createSessionLedger } from '../src/index.ts';
import { HISTORY, openLedgerStore } from '../src/store/index.ts';

const folders: string[] = [];
const SESSION = 'aaaaaaaa-0000-4000-8000-000000000001';
const PROMPT = 'please rename the widget module';
const FACT = 'fixture fact for restore';

const folderOf = (): string => {
    const folder = mkdtempSync(join(tmpdir(), 'agent-sdk-engine-'));
    folders.push(folder);
    return folder;
};

after(() => {
    for (const folder of folders) {
        rmSync(folder, { recursive: true, force: true });
    }
});

const transcriptIn = (folder: string): string => {
    const root = join(folder, 'projects');
    mkdirSync(join(root, '-tmp-proj'), { recursive: true });
    const lines = [
        { type: 'user', timestamp: '2026-01-01T00:00:00.000Z', sessionId: SESSION, message: { role: 'user', content: PROMPT } },
        { type: 'assistant', timestamp: '2026-01-01T00:00:05.000Z', sessionId: SESSION, message: { role: 'assistant', content: [{ type: 'text', text: 'renamed it' }] } },
    ];
    writeFileSync(join(root, '-tmp-proj', `${SESSION}.jsonl`), `${lines.map((line) => JSON.stringify(line)).join('\n')}\n`);
    return root;
};

const scriptedWriter = (): { readonly writer: Writer; readonly requests: RecapRequest[] } => {
    const requests: RecapRequest[] = [];
    const writer: Writer = {
        backend: 'scripted',
        contract: 'free-text',
        write: (request) => {
            requests.push(request);
            const ops = [{ op: 'add', section: 'now', text: FACT, why: null, ref: null, at: null, agent: null }];
            return Promise.resolve({ kind: 'written', text: text(JSON.stringify({ ops })), costUsd: usd(0) });
        },
    };
    return { writer, requests };
};

const ready = (options: Parameters<typeof createLedgerEngine>[0]) => {
    const made = createLedgerEngine(options);
    if (made.kind !== 'ready') {
        throw new Error(`the engine is ${made.kind}`);
    }
    return made;
};

const parsedScope = (id: string) => {
    const parsed = parseScopeId(id);
    if (parsed.kind === 'err') {
        throw new Error('scope');
    }
    return parsed.value;
};

test('a session start and a stop write a recap from the transcript, and a compact start restores its facts', async () => {
    const folder = folderOf();
    const path = join(folder, 'ledger.db');
    const { writer, requests } = scriptedWriter();
    const made = ready({ path, writer, transcriptsRoot: transcriptIn(folder), clock: { now: () => instant(1_000) } });
    const ledger = createSessionLedger(made.engine);
    const input = { session_id: SESSION, cwd: folder };
    await ledger.hooks.SessionStart?.[0]?.hooks[0]?.({ ...input, hook_event_name: 'SessionStart', source: 'startup' });
    await ledger.hooks.Stop?.[0]?.hooks[0]?.({ ...input, hook_event_name: 'Stop' });
    await ledger.settled();
    await made.engine.flush(parsedScope(`agent-sdk:${SESSION}`));
    equal(requests.length, 1);
    ok(JSON.stringify(requests[0]).includes(PROMPT));

    const restored = await ledger.hooks.SessionStart?.[0]?.hooks[0]?.({ ...input, hook_event_name: 'SessionStart', source: 'compact' });
    ok(restored?.hookSpecificOutput?.additionalContext.includes(FACT));
    await ledger.close();
    made.close();

    const again = openLedgerStore(path);
    equal(again.kind, 'ready');
    if (again.kind === 'ready') {
        const recap = again.records.readRecap(parsedScope(`agent-sdk:${SESSION}`));
        ok(recap !== null && !('running' in recap && recap.running === true));
        again.close();
    }
});

test('a file from a newer library is returned as newer-store, not thrown', () => {
    const path = join(folderOf(), 'ledger.db');
    const newer = openStore(path, [...HISTORY, { version: HISTORY.length + 1, name: 'a later change', up: ['CREATE TABLE later (id INTEGER)'] }], 'owner');
    equal(newer.kind, 'ready');
    newer.close();
    const made = createLedgerEngine({ path, writer: scriptedWriter().writer });
    equal(made.kind, 'newer-store');
    made.close();
});

test('a session with no transcript is not found by the reader and the writer is never called', async () => {
    const folder = folderOf();
    const root = join(folder, 'empty-projects');
    mkdirSync(root);
    const reader = claudeReader({ root });
    const located = await reader.locate(followed(key('a'), { session: session('missing-session') }));
    ok(isUnknown(located) && located.why.why === 'not-found');
    const { writer, requests } = scriptedWriter();
    const made = ready({ path: join(folder, 'ledger.db'), writer, transcriptsRoot: root });
    const ledger = createSessionLedger(made.engine);
    await ledger.hooks.SessionStart?.[0]?.hooks[0]?.({ hook_event_name: 'SessionStart', session_id: 'missing-session', cwd: folder, source: 'startup' });
    await ledger.hooks.Stop?.[0]?.hooks[0]?.({ hook_event_name: 'Stop', session_id: 'missing-session', cwd: folder });
    await ledger.settled();
    await made.engine.flush(scope('agent-sdk:missing-session'));
    deepEqual(requests, []);
    await ledger.close();
    made.close();
});

test('a transcript with a bad line is read without throwing', async () => {
    const folder = folderOf();
    const root = transcriptIn(folder);
    writeFileSync(join(root, '-tmp-proj', `${SESSION}.jsonl`), 'not json\n', { flag: 'a' });
    const reader = claudeReader({ root });
    const located = await reader.locate(followed(key('a'), { session: session(SESSION) }));
    ok(!isUnknown(located));
    if (!isUnknown(located)) {
        const chunk = await reader.read(located.source, UNREAD, count(100_000));
        ok(!isUnknown(chunk));
    }
});
