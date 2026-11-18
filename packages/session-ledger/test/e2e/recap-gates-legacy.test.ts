import assert from 'node:assert/strict';
import { test } from 'node:test';
import { brand } from '@stateforge-labs/session-ledger/unstable/recap/domain/brand.ts';
import type { Fact } from '@stateforge-labs/session-ledger/unstable/recap/domain/fact.ts';
import { docIdOf } from '@stateforge-labs/session-ledger/unstable/recap/domain/gates/gate.ts';
import { addStats, correctionOf, NO_STATS, quoted } from '@stateforge-labs/session-ledger/unstable/recap/domain/gates/gatekeeper.ts';
import { said } from '@stateforge-labs/session-ledger/unstable/recap/domain/gates/item-gate.ts';
import { jaccard, tokensOf } from '@stateforge-labs/session-ledger/unstable/recap/domain/gates/jaccard.ts';
import { languageOfLine } from '@stateforge-labs/session-ledger/unstable/recap/domain/gates/language.ts';
import { itemOf, subjectOf } from '@stateforge-labs/session-ledger/unstable/recap/domain/gates/legacy.ts';
import { hasReference } from '@stateforge-labs/session-ledger/unstable/recap/domain/gates/link.ts';
import { isSpecific } from '@stateforge-labs/session-ledger/unstable/recap/domain/gates/specific.ts';
import { foldedOf, jaccard as setJaccard, tokensOf as wordTokensOf, wordsOf } from '@stateforge-labs/session-ledger/unstable/recap/domain/gates/words.ts';

const fact: Fact = {
    id: brand<string, 'FactId'>('f1'), task: { tab: 'tab-1', key: 't1' }, section: 'decisions', text: 'use sqlite', why: 'it is local', ref: null, agent: null, anchor: null,
    firstAt: 1, lastAt: 1, state: 'open', closedWhy: null, closedAt: null, language: 'en',
};

test('the ledger gate helpers name a shown fact, quote an op and count findings', () => {
    assert.equal(docIdOf(fact, new Map([['D1', fact]])), 'D1');
    assert.equal(docIdOf(fact, new Map()), null);
    const close = { op: 'close', id: 'D1', why: 'done' } as const;
    assert.equal(quoted(close), 'close D1');
    const finding = { at: 0, gate: 'G6', outcome: 'refuse', reason: 'unknown' } as const;
    assert.equal(correctionOf([close], [finding]), 'G6: close D1 — unknown');
    const stats = addStats(NO_STATS, { kept: [], refused: [finding], flagged: [] }, 2);
    assert.deepEqual(stats, { refused: { G6: 1 }, flagged: {}, dropped: 2 });
    const item = itemOf({ op: 'update', id: 'D1', text: 'use postgres', why: null }, 3, new Map([['D1', fact]]));
    assert.deepEqual(item, { task: '', section: 'decisions', position: 3, text: 'use postgres — it is local' });
});

test('the item gate helpers read words, language, references and the subject', () => {
    assert.equal(said('es', 'yes', 'sí'), 'sí');
    assert.deepEqual([...tokensOf('The big Build')], ['the', 'big', 'build']);
    assert.equal(jaccard('big build', 'big build'), 1);
    assert.equal(languageOfLine('the build is green and the tests pass'), 'en');
    assert.equal(languageOfLine('ok'), null);
    assert.equal(hasReference('see `src/a.ts`'), true);
    assert.equal(hasReference('nothing here'), false);
    assert.deepEqual(subjectOf('Claude fixed it', new Set(['claude'])), { rest: ' fixed it' });
    assert.equal(subjectOf('The build broke', new Set(['claude'])), null);
});

test('the word helpers fold, tokenise and compare, and a specific item names something', () => {
    assert.deepEqual(wordsOf('Fix the CI, now!'), ['Fix', 'the', 'CI', 'now']);
    assert.equal(foldedOf('a,  b'), 'a b');
    assert.deepEqual([...wordTokensOf('Fix the CI')], ['fix', 'the']);
    assert.equal(setJaccard(new Set(['a', 'b']), new Set(['b', 'c'])), 1 / 3);
    assert.equal(setJaccard(new Set(), new Set()), 0);
    assert.equal(isSpecific('bump to v2'), true);
    assert.equal(isSpecific('make it better'), false);
});
