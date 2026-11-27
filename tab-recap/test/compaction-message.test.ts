import { test } from 'node:test';
import assert from 'node:assert/strict';
import { guidanceOf, MESSAGE_LIMIT } from '#src/recap/application/compaction-message.ts';
import type { Material } from '#src/recap/application/compaction-message.ts';
import { NO_SECTIONS } from '@stateforge-labs/session-ledger';
import { parseText, type Text, textOf } from '@stateforge-labs/session-ledger';
import type { LaneWebRecord } from '#src/ports/tab-views.ts';
import { must } from '@stateforge-labs/session-ledger';

const web: LaneWebRecord = { base: textOf('https://git.example/team/app'), forge: 'gitlab', branch: textOf('feat/cart') };
const sections = {
    ...NO_SECTIONS, goal: textOf('Ship the cart rewrite'), now: [textOf('Running the checkout tests')], needs: [textOf('Should guests keep their basket?')],
    decisions: [textOf('Use sqlite, it needs no server')], next: [textOf('Open the merge request')], rules: [textOf('Never push to main')], links: [textOf('!252'), textOf('`src/cart.ts`')],
};
const said = (raw: string): Text => must(parseText(raw));
const material = (over: Partial<Material> = {}): Material => ({ sections, web, note: null, ...over });

const many = (label: string): Text[] => Array.from({ length: 14 }, (_, at) => textOf(`${label} ${at} ${'x'.repeat(60)}`));

test('over the limit: references go first, then next steps, then decisions; the note and the goal stay whole', () => {
    const big = { ...sections, links: many('ref'), next: many('next'), now: [], decisions: many('decision'), needs: [], rules: [] };
    const text = guidanceOf(material({ sections: big, note: said('keep the note whole') }));
    assert.ok(text.length <= MESSAGE_LIMIT, String(text.length));
    assert.ok(text.includes('keep the note whole') && text.includes('Ship the cart rewrite'));
    assert.ok(!text.includes('ref 13') && text.includes('next 13'), 'references are cut first, from the end');
    assert.ok(text.includes('decision 13'), 'decisions are whole while references can still give');
    const tighter = guidanceOf(material({ sections: { ...big, decisions: many('decision').map((line) => textOf(line + 'y'.repeat(150))) }, note: said('n') }));
    assert.ok(tighter.length <= MESSAGE_LIMIT && !tighter.includes('next 0'), 'next steps go before decisions');
});
