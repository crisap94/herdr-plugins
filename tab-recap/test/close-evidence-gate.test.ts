import { test } from 'node:test';
import assert from 'node:assert/strict';
import { closeEvidenceGate } from '#src/recap/domain/gates/g13-close-evidence.ts';
import type { GateContext } from '#src/recap/domain/gates/gate.ts';
import { foldedOf } from '#src/recap/domain/gates/words.ts';
import type { CloseOp, Operation } from '#src/recap/domain/ops.ts';
import { brand } from '#src/recap/domain/brand.ts';
import type { Text } from '#src/recap/domain/text.ts';

const SOURCE = foldedOf('Merged !256 after both pipelines went green.\nThe release is tagged: v1.9.0');
const context: GateContext = { now: 1, language: 'en', agents: [], shown: new Map(), open: [], closedLately: [], source: SOURCE };
const quote = (value: string): Text => brand<string, 'Text'>(value);
const close = (why: CloseOp['why'], anchor?: string): Operation => ({ op: 'close', id: 'f3', why, ...(anchor === undefined ? {} : { anchor: quote(anchor) }) });

test('G13: a close as done with no anchor is refused once, and so is an empty anchor', () => {
    const noAnchor = closeEvidenceGate.check([close('done')], context);
    assert.deepEqual(noAnchor.map((finding) => [finding.at, finding.gate, finding.outcome]), [[0, 'G13', 'refuse']]);
    assert.equal(noAnchor[0]?.reason, 'closing f3 as done needs an anchor: copy a quote of at most 120 characters from the input that shows it');
    assert.equal(closeEvidenceGate.check([close('done', '')], context).length, 1);
});

test('G13: a close as wrong with an anchor found in the input passes', () => {
    assert.deepEqual(closeEvidenceGate.check([close('wrong', 'both pipelines went green')], context), []);
});

test('G13: a close as done with an anchor the input does not hold is refused once, and the reason says never paraphrase', () => {
    const findings = closeEvidenceGate.check([close('done', 'the pipelines were green')], context);
    assert.deepEqual(findings.map((finding) => [finding.at, finding.gate, finding.outcome]), [[0, 'G13', 'refuse']]);
    assert.equal(findings[0]?.reason, 'the anchor "the pipelines were green" of closing f3 is not in the input: copy it exactly, never paraphrase');
});

test('G13: a close as superseded is not checked, with or without an anchor', () => {
    assert.deepEqual(closeEvidenceGate.check([close('superseded')], context), []);
    assert.deepEqual(closeEvidenceGate.check([close('superseded', 'not in the input')], context), []);
});

test('G13: adds and updates are not checked', () => {
    const add: Operation = { op: 'add', section: 'done', text: 'Merged !256', why: null, ref: null, at: null, agent: null };
    const update: Operation = { op: 'update', id: 'f3', text: 'Keep SQLite', why: null };
    assert.deepEqual(closeEvidenceGate.check([add, update], context), []);
});

test('G13: findings keep the position of each refused close among mixed operations', () => {
    const findings = closeEvidenceGate.check([close('answered'), close('done'), close('wrong', 'The release is tagged'), close('done', 'nowhere')], context);
    assert.deepEqual(findings.map((finding) => finding.at), [1, 3]);
});
