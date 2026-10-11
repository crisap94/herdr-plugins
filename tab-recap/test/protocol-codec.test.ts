import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseValue, serializeValue } from '#src/protocol/codec.ts';
import type { FieldSpec, ParsedValue } from '#src/protocol/codec.ts';
import { requestId } from '#src/protocol/primitives.ts';
import type { IdGrammar, RequestId, TokenValue } from '#src/protocol/primitives.ts';

const ID_LEGACY: FieldSpec = { kind: 'id', grammar: 'legacy-length' };
const ID_SAFE: FieldSpec = { kind: 'id', grammar: 'token-safe' };
const NOTE: FieldSpec = { kind: 'rest', name: 'note', optional: true, maxChars: null };
const TOOL: FieldSpec = { kind: 'word', name: 'tool', optional: false };
const URGENT: FieldSpec = { kind: 'flag', name: 'urgent', text: 'urgent' };
const PHASE: FieldSpec = { kind: 'word', name: 'phase', optional: true };

const idOf = (raw: string, grammar: IdGrammar): RequestId => {
    const id = requestId(raw, grammar);
    if (id.kind === 'err') {
        throw new Error(`bad test id ${raw}`);
    }
    return id.value;
};

const valueOf = (result: ReturnType<typeof serializeValue>): TokenValue => {
    if (result.kind === 'err') {
        throw new Error(`refused: ${JSON.stringify(result.error)}`);
    }
    return result.value;
};

function generator(seed: number): <T>(items: readonly T[]) => T {
    let state = seed;
    return <T>(items: readonly T[]): T => {
        state = (state * 1103515245 + 12345) % 2147483648;
        const item = items[Math.floor((state / 2147483648) * items.length)];
        if (item === undefined) {
            throw new Error('empty choice');
        }
        return item;
    };
}

test('an id with a note round-trips, and a rest keeps its colons', () => {
    const specs = [ID_LEGACY, NOTE];
    assert.equal(valueOf(serializeValue(specs, { id: idOf('r.7', 'legacy-length'), note: null })), 'r.7');
    assert.equal(valueOf(serializeValue(specs, { id: idOf('r.7', 'legacy-length'), note: '' })), 'r.7:');
    const withColons: ParsedValue = { id: idOf('r.7', 'legacy-length'), note: 'a:b:c' };
    const wire = valueOf(serializeValue(specs, withColons));
    assert.equal(wire, 'r.7:a:b:c');
    assert.deepEqual(parseValue(specs, wire), { kind: 'ok', value: withColons });
});

test('an id, a word and a flag round-trip in order, with absent fields at the end', () => {
    const specs = [ID_SAFE, TOOL, URGENT, PHASE];
    const full: ParsedValue = { id: idOf('r_7', 'token-safe'), tool: 'probe', urgent: true, phase: 'late' };
    const wire = valueOf(serializeValue(specs, full));
    assert.equal(wire, 'r_7:probe:urgent:late');
    assert.deepEqual(parseValue(specs, wire), { kind: 'ok', value: full });
    const short: ParsedValue = { id: idOf('r_7', 'token-safe'), tool: 'probe', urgent: false, phase: null };
    assert.equal(valueOf(serializeValue(specs, short)), 'r_7:probe');
    assert.deepEqual(parseValue(specs, 'r_7:probe'), { kind: 'ok', value: short });
});

test('an id alone round-trips', () => {
    const specs = [ID_SAFE];
    const only: ParsedValue = { id: idOf('r_7', 'token-safe') };
    assert.equal(valueOf(serializeValue(specs, only)), 'r_7');
    assert.deepEqual(parseValue(specs, 'r_7'), { kind: 'ok', value: { id: only.id } });
});

test('a serialized value of 80 characters is accepted and one of 81 is refused', () => {
    const specs = [ID_LEGACY, NOTE];
    const id = idOf('r.7', 'legacy-length');
    assert.equal(serializeValue(specs, { id, note: 'x'.repeat(76) }).kind, 'ok');
    assert.deepEqual(serializeValue(specs, { id, note: 'x'.repeat(77) }), { kind: 'err', error: { reason: 'too-long', subject: 'TokenValue' } });
});

test('an absent field followed by a present one is refused, never written ambiguously', () => {
    const specs = [ID_SAFE, TOOL, URGENT, PHASE];
    const id = idOf('r_7', 'token-safe');
    assert.deepEqual(serializeValue(specs, { id, tool: 'probe', urgent: false, phase: 'late' }), {
        kind: 'err',
        error: { reason: 'bad-grammar', subject: 'phase' },
    });
    assert.deepEqual(serializeValue(specs, { id, tool: null, urgent: false, phase: null }), {
        kind: 'err',
        error: { reason: 'bad-grammar', subject: 'tool' },
    });
});

test('a generated set of values round-trips, and both accepted and refused values occur', () => {
    const specs = [ID_SAFE, TOOL, URGENT, PHASE, NOTE];
    const pick = generator(7);
    const ids = ['r_7', 'a1', 'Z-9', 'q'].map((raw) => idOf(raw, 'token-safe'));
    const words = ['probe', 'b-2', 'c_3'];
    const phrases = ['', 'x', 'a:b', 'two:colons:here', 'y'.repeat(40), 'z'.repeat(70)];
    let accepted = 0;
    let refused = 0;
    for (let round = 0; round < 800; round += 1) {
        const value: ParsedValue = {
            id: pick(ids),
            tool: pick([null, ...words]),
            urgent: pick([true, false]),
            phase: pick([null, ...words]),
            note: pick([null, ...phrases]),
        };
        const wire = serializeValue(specs, value);
        if (wire.kind === 'err') {
            refused += 1;
            continue;
        }
        accepted += 1;
        assert.deepEqual(parseValue(specs, wire.value), { kind: 'ok', value }, wire.value);
    }
    assert.ok(accepted >= 100, 'the generator produced too few accepted values');
    assert.ok(refused > 0, 'the generator never reached a refusal');
});
