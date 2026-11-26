import assert from 'node:assert/strict';
import { test } from 'node:test';
import { brand } from '@stateforge-labs/session-ledger';
import { textOf } from '@stateforge-labs/session-ledger';
import type { Fact } from '@stateforge-labs/session-ledger';
import { docIdOf } from '@stateforge-labs/session-ledger';
import { addStats, correctionOf, gateName, NO_STATS, quoted } from '@stateforge-labs/session-ledger';
import { said } from '@stateforge-labs/session-ledger';
import { jaccard } from '@stateforge-labs/session-ledger';
import { similarTokensOf as tokensOf } from '@stateforge-labs/session-ledger';
import { itemOf } from '@stateforge-labs/session-ledger';
import { languageOfLine } from '@stateforge-labs/session-ledger';
import { subjectOf } from '@stateforge-labs/session-ledger';
import { hasReference } from '@stateforge-labs/session-ledger';
import { isSpecific } from '@stateforge-labs/session-ledger';
import { foldedOf, wordsOf } from '@stateforge-labs/session-ledger';
import { wordJaccard as setJaccard, wordTokensOf } from '@stateforge-labs/session-ledger';
import { factIdOf } from '@stateforge-labs/session-ledger';
import { instant } from '@stateforge-labs/session-ledger';
import { scopeIdOf } from '@stateforge-labs/session-ledger';

const count = brand<number, 'Count'>;

const fact: Fact = {
    id: brand<string, 'FactId'>('f1'), task: { scope: scopeIdOf('tab-1'), key: textOf('t1') }, section: 'decisions', text: textOf('use sqlite'), why: textOf('it is local'), ref: null, agent: null, anchor: null,
    firstAt: instant(1), lastAt: instant(1), state: 'open', closedWhy: null, closedAt: null, language: textOf('en'),
};

test('the ledger gate helpers name a shown fact, quote an op and count findings', () => {
    assert.equal(docIdOf(fact, new Map([[textOf('D1'), fact]])), 'D1');
    assert.equal(docIdOf(fact, new Map()), null);
    const close = { op: 'close', id: factIdOf('D1'), why: 'done' } as const;
    assert.equal(quoted(close), 'close D1');
    const finding = { at: count(0), gate: 'G6', outcome: 'refuse', reason: textOf('unknown') } as const;
    assert.equal(correctionOf([close], [finding]), 'G6: close D1 — unknown');
    const stats = addStats(NO_STATS, { kept: [], refused: [finding], flagged: [] }, count(2));
    assert.deepEqual(stats, { refused: { [gateName('G6')]: count(1) }, flagged: {}, dropped: count(2) });
    const item = itemOf({ op: 'update', id: factIdOf('D1'), text: textOf('use postgres'), why: null }, count(3), new Map([[textOf('D1'), fact]]));
    assert.deepEqual(item, { task: '', section: 'decisions', position: 3, text: 'use postgres — it is local' });
});

test('the item gate helpers read words, language, references and the subject', () => {
    assert.equal(said(textOf('es'), textOf('yes'), textOf('sí')), 'sí');
    assert.deepEqual([...tokensOf(textOf('The big Build'))], ['the', 'big', 'build']);
    assert.equal(jaccard(textOf('big build'), textOf('big build')), 1);
    assert.equal(languageOfLine(textOf('the build is green and the tests pass')), 'en');
    assert.equal(languageOfLine(textOf('ok')), null);
    assert.equal(hasReference(textOf('see `src/a.ts`')), true);
    assert.equal(hasReference(textOf('nothing here')), false);
    assert.deepEqual(subjectOf(textOf('Claude fixed it'), new Set([textOf('claude')])), { rest: ' fixed it' });
    assert.equal(subjectOf(textOf('The build broke'), new Set([textOf('claude')])), null);
});

test('the word helpers fold, tokenise and compare, and a specific item names something', () => {
    assert.deepEqual(wordsOf(textOf('Fix the CI, now!')), ['Fix', 'the', 'CI', 'now']);
    assert.equal(foldedOf(textOf('a,  b')), 'a b');
    assert.deepEqual([...wordTokensOf(textOf('Fix the CI'))], ['fix', 'the']);
    assert.equal(setJaccard(new Set([textOf('a'), textOf('b')]), new Set([textOf('b'), textOf('c')])), 1 / 3);
    assert.equal(setJaccard(new Set(), new Set()), 0);
    assert.equal(isSpecific(textOf('bump to v2')), true);
    assert.equal(isSpecific(textOf('make it better')), false);
});
