import { test } from 'node:test';
import { tokenEntries } from '#test/fakes/token-entries.ts';
import assert from 'node:assert/strict';
import { worksiteOf } from '#src/recap/application/worksite-section.ts';
import type { WorksiteDeps, WorksiteInput } from '#src/recap/application/worksite-section.ts';
import { countOf } from '@stateforge-labs/session-ledger';
import type { Workplaces, RepoResult } from '@stateforge-labs/session-ledger';
import type { SessionCursor } from '@stateforge-labs/session-ledger';
import { must } from '@stateforge-labs/session-ledger';
import { parseDirectory } from '@stateforge-labs/session-ledger';
import { parseText, textOf } from '@stateforge-labs/session-ledger';
import { MemoryWorksite } from '#test/fakes/worksite-reader.ts';
import { agentKind, paneId } from '#test/support/ids.ts';
import { sourcePathOf, cursorOf } from '@stateforge-labs/session-ledger';

const DIR = '/work/project';
const CURSOR: SessionCursor = { key: paneId('w1:p1'), agent: agentKind('claude'), transcript: sourcePathOf('session.jsonl'), cursor: cursorOf(10), tail: null, title: null, lastPrompt: null, harnessRecap: null };
const repoAt = (result: RepoResult): Workplaces => ({ repoOf: () => Promise.resolve(result) });
const repo: RepoResult = { kind: 'repo', root: must(parseDirectory('/work/project')), branch: must(parseText('feat/x')), web: null };
const edits = (files: readonly { readonly path: string; readonly count: number }[]): WorksiteDeps['edits'] & { readonly asked: (readonly SessionCursor[])[] } => {
    const asked: SessionCursor[][] = [];
    return { asked, of: (lanes) => { asked.push([...lanes]); return Promise.resolve(files.map((file) => ({ path: textOf(file.path), count: countOf(file.count) }))); } };
};

function deps(site: MemoryWorksite, result: RepoResult = repo, files: readonly { readonly path: string; readonly count: number }[] = []): WorksiteDeps {
    return { reader: site, repo: repoAt(result), edits: edits(files) };
}

const input = (overrides: Partial<WorksiteInput> = {}): WorksiteInput => ({ directory: textOf(DIR), cursor: CURSOR, tokens: new Map(), ...overrides });

test('waiting tokens are listed by name, never by value, and an empty one is not listed', async () => {
    const site = new MemoryWorksite();
    site.set(DIR, { commit: null, paths: [] });
    const snapshot = await worksiteOf(deps(site), input({ tokens: tokenEntries({ 'awaiting-review': 'secret value', 'awaiting-empty': '', 'note-tool': 'private note', unrelated: 'x' }) }));
    assert.equal(snapshot.kind, 'known');
    assert.deepEqual(snapshot.tokens, ['awaiting-review', 'note-tool']);
    assert.equal(JSON.stringify(snapshot).includes('secret value'), false);
    assert.equal(JSON.stringify(snapshot).includes('private note'), false);
});
