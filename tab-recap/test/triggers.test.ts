// Mandatory candidates found with no model: commits, edits, errors and questions, in English and Spanish.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Entry } from '#src/ports/transcripts.ts';
import { capStubs, MAX_STUBS, triggersOf } from '#src/recap/application/triggers.ts';
import type { Stub } from '#src/recap/application/triggers.ts';
import { QUOTE_CHARS, quotedIn } from '#src/recap/domain/quote.ts';
import { longTurn } from '#test/fakes/long-turn.ts';

const shell = (text: string): Entry => ({ role: 'tool', kind: 'shell', text, at: 1_000 });
const kindsOf = (entries: readonly Entry[]): readonly string[] => triggersOf(entries).map((stub) => stub.kind);

test('a shell command that starts a commit, merge, push, tag, pull request, release or merge request is a trigger; others are not', () => {
    for (const command of ['git commit -m "x"', 'git -C /repo push origin main', 'git merge feat/x', 'git tag v1', 'gh pr create --fill', 'gh release create v2', 'glab mr merge 41']) {
        assert.deepEqual(kindsOf([shell(command)]), ['commit'], command);
    }
    for (const command of ['git status', 'git log --oneline', 'npm test', 'echo git commit']) {
        assert.deepEqual(kindsOf([shell(command)]), [], command);
    }
    assert.deepEqual(kindsOf([{ role: 'tool', kind: 'other', text: 'git commit', at: 1 }]), [], 'only a shell call');
});

test('a commit in a chain is found by its own step, the anchor is that step, and a reference to a merge request is kept', () => {
    const [stub, other] = triggersOf([shell('cd /repo && git commit -m "importer: stream the parser" && glab mr create --title "!41 importer"')]);
    assert.deepEqual([stub?.anchor, stub?.section, stub?.at], ['git commit -m "importer: stream the parser"', 'done', 1_000]);
    assert.deepEqual([other?.anchor, other?.ref], ['glab mr create --title "!41 importer"', '!41']);
    assert.equal(triggersOf([shell('glab mr merge !41')])[0]?.ref, '!41');
});

test('an edit is a trigger by its path, once per path', () => {
    const edits = [1, 2, 3].map((): Entry => ({ role: 'tool', kind: 'edit', text: 'src/a.ts', at: 1 }));
    assert.deepEqual(triggersOf([...edits, { role: 'tool', kind: 'edit', text: 'src/b.ts', at: 2 }]).map((stub) => [stub.kind, stub.ref]), [['edit', 'src/a.ts'], ['edit', 'src/b.ts']]);
    assert.deepEqual(kindsOf([{ role: 'tool', kind: 'read', text: 'src/a.ts' }]), []);
});

test('an error, a failure, a cross or a traceback anywhere in a turn is a trigger; the anchor is the line, cut to the quote size', () => {
    for (const text of ['TypeError: x is not a function', 'FAIL test/a.test.ts', '✖ 3 tests failed', 'Traceback (most recent call last):']) {
        assert.deepEqual(kindsOf([{ role: 'agent', text: `fine so far\n${text}\nmore`, at: 1 }]), ['error'], text);
    }
    const long = `${'a '.repeat(200)}Error: boom ${'b '.repeat(200)}`;
    const [stub] = triggersOf([{ role: 'agent', text: long }]);
    assert.ok(stub !== undefined && stub.anchor.length <= QUOTE_CHARS && stub.anchor.includes('Error: boom'), stub?.anchor);
    assert.ok(quotedIn(stub.anchor, long));
    assert.deepEqual(kindsOf([{ role: 'agent', text: 'all good, no failures' }]), []);
});

test('a turn that ends in a question mark, or a prompt that opens like one, is a trigger — in English and Spanish, from the operator or the agent', () => {
    const asks = [
        { role: 'agent' as const, text: 'Done with the parser. Should I also remove the legacy API?' },
        { role: 'user' as const, text: 'Which branch do we ship from' },
        { role: 'user' as const, text: 'can we skip the migration' },
        { role: 'user' as const, text: 'Do you think this is safe' },
        { role: 'user' as const, text: '¿Podemos dejarlo para mañana' },
        { role: 'user' as const, text: 'Deberíamos borrar la rama vieja' },
        { role: 'user' as const, text: 'cuál es el plan?' },
    ];
    for (const ask of asks) {
        assert.deepEqual(kindsOf([ask]), ['question'], ask.text);
    }
    assert.equal(triggersOf([asks[0] as Entry])[0]?.anchor, 'Should I also remove the legacy API?');
    assert.deepEqual(kindsOf([{ role: 'user', text: 'Ship it.' }, { role: 'agent', text: 'Which is fine, shipping.' }]), [], 'an agent turn only counts when it ends in a question');
});

test('the recorded 300-row turn holds every kind: the commit and push, the merge request, the error, the questions and one edit per file', () => {
    const stubs = triggersOf(longTurn());
    const kinds = new Set(stubs.map((stub) => stub.kind));
    assert.deepEqual([...kinds].toSorted(), ['commit', 'edit', 'error', 'question']);
    assert.deepEqual(stubs.filter((stub) => stub.kind === 'commit').map((stub) => stub.anchor), ['git commit -m "importer: stream the parser"', 'git push origin feat/async-import', 'glab mr create --title "importer: async streams" --target-branch main']);
    assert.equal(stubs.filter((stub) => stub.kind === 'edit').length, 50, 'one per file');
    assert.ok(stubs.some((stub) => stub.kind === 'question' && stub.anchor.startsWith('Should I also remove')));
});

test('a chunk keeps at most MAX_STUBS: commits first, then errors, questions and edits; the order of time is kept', () => {
    const stubs = triggersOf(longTurn());
    const kept: readonly Stub[] = capStubs(stubs);
    assert.equal(kept.length, MAX_STUBS);
    assert.deepEqual(kept.filter((stub) => stub.kind !== 'edit').length, stubs.filter((stub) => stub.kind !== 'edit').length, 'the heavier kinds all stay');
    assert.deepEqual(kept, stubs.filter((stub) => kept.includes(stub)));
    assert.equal(capStubs(stubs, 1)[0]?.kind, 'commit');
});
