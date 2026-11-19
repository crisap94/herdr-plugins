import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCompactionTokensRecord } from '#src/ports/session-source.ts';
import { parseDisagreementRecord, parsePairRecord, parseVerdictRecord } from '#src/ports/verdicts.ts';
import { parseGateTally, parseRunEntry, parseRunRecord } from '#src/ports/run-inputs.ts';
import { parseLaneWebRecord, parseTabLaneRecord, parseTabViewRecord } from '#src/ports/tab-views.ts';

const web = { base: 'https://gitlab.example/repo', forge: 'gitlab', branch: 'main' };

const lane = { pane: 'w1:p1', agent: 'claude', status: 'working', title: null, cwd: '/repo' };

const pair = { check: 'c1', judge: 'pass', operator: 'fail' };

test('a lane web parses a gitlab or github forge and refuses another', () => {
    assert.deepEqual(parseLaneWebRecord(web), { kind: 'ok', value: web });
    assert.deepEqual(parseLaneWebRecord({ ...web, forge: 'github', branch: null }), { kind: 'ok', value: { ...web, forge: 'github', branch: null } });
    assert.equal(parseLaneWebRecord({ ...web, forge: 'bitbucket' }).kind, 'err');
});

test('a tab lane keeps absent extras out, keeps null ones, and parses its web and context', () => {
    assert.deepEqual(parseTabLaneRecord(lane), { kind: 'ok', value: lane });
    const full = { ...lane, lastPrompt: null, web, context: { tokens: 10, window: 100, source: 'agent' }, since: 50 };
    assert.deepEqual(parseTabLaneRecord(full), { kind: 'ok', value: full });
    assert.equal(parseTabLaneRecord({ ...lane, context: { tokens: 10, window: 100, source: 'guess' } }).kind, 'err');
    assert.equal(parseTabLaneRecord({ ...lane, web: { ...web, forge: 'svn' } }).kind, 'err');
    assert.equal(parseTabLaneRecord({ ...lane, agent: '' }).kind, 'err');
});

test('a pair parses the judge and operator outcomes of one check', () => {
    assert.deepEqual(parsePairRecord(pair), { kind: 'ok', value: pair });
    assert.equal(parsePairRecord({ ...pair, operator: 'skip' }).kind, 'err');
    assert.equal(parsePairRecord(null).kind, 'err');
});
const run = 'run_01arz3ndektsv4rrffq69g5fav';

const fact = 'fct_01arz3ndektsv4rrffq69g5fav';

const stats = { refused: { now: 1 }, flagged: {}, dropped: 0 };

test('a run record parses its id, tab, instant, language and presence, and keeps null backend and stats', () => {
    const record = { id: run, tab: 'w1:t1', at: 1000, language: 'en', backend: null, input: 'present', gateStats: null };
    assert.deepEqual(parseRunRecord(record), { kind: 'ok', value: record });
    assert.deepEqual(parseRunRecord({ ...record, gateStats: stats, backend: 'codex' }), { kind: 'ok', value: { ...record, gateStats: stats, backend: 'codex' } });
    assert.equal(parseRunRecord({ ...record, input: 'maybe' }).kind, 'err');
    assert.equal(parseRunRecord(null).kind, 'err');
});

test('a run entry parses a known section, a fact id and a birth, and refuses an unknown section', () => {
    const entry = { key: 'k1', section: 'now', text: 'working', fact, birth: 'born', anchor: null };
    assert.deepEqual(parseRunEntry(entry), { kind: 'ok', value: entry });
    assert.equal(parseRunEntry({ ...entry, section: 'misc' }).kind, 'err');
    assert.equal(parseRunEntry({ ...entry, fact: run }).kind, 'err');
    assert.equal(parseRunEntry('entry').kind, 'err');
});

test('a gate tally parses its instant and gate counts and refuses a negative count', () => {
    const tally = { at: 2000, stats };
    assert.deepEqual(parseGateTally(tally), { kind: 'ok', value: tally });
    assert.equal(parseGateTally({ at: 2000, stats: { ...stats, dropped: -1 } }).kind, 'err');
    assert.equal(parseGateTally(7).kind, 'err');
});

test('a compaction tokens record parses its counts and origin and refuses an unknown origin', () => {
    const compaction = { tokensBefore: 900, tokensAfter: null, origin: 'auto' };
    assert.deepEqual(parseCompactionTokensRecord(compaction), { kind: 'ok', value: compaction });
    assert.equal(parseCompactionTokensRecord({ ...compaction, origin: 'robot' }).kind, 'err');
    assert.equal(parseCompactionTokensRecord(undefined).kind, 'err');
});

test('a verdict record parses its run, outcome and source and refuses an unknown source', () => {
    const verdict = { run, item: null, check: 'c1', pass: 'fail', critique: 'thin', judge: 'j1', at: 3000, source: 'judge' };
    assert.deepEqual(parseVerdictRecord(verdict), { kind: 'ok', value: verdict });
    assert.equal(parseVerdictRecord({ ...verdict, source: 'bot' }).kind, 'err');
    assert.equal(parseVerdictRecord({ ...verdict, run: fact }).kind, 'err');
    assert.equal(parseVerdictRecord([]).kind, 'err');
});

test('a disagreement record parses both outcomes and its nullable reasons and refuses a missing item', () => {
    const disagreement = { run, item: 'i1', check: 'c1', judge: 'pass', operator: 'fail', judgeCritique: null, reason: 'why', at: 4000 };
    assert.deepEqual(parseDisagreementRecord(disagreement), { kind: 'ok', value: disagreement });
    assert.equal(parseDisagreementRecord({ ...disagreement, item: null }).kind, 'err');
    assert.equal(parseDisagreementRecord({ ...disagreement, operator: 'skip' }).kind, 'err');
    assert.equal(parseDisagreementRecord('row').kind, 'err');
});

test('a tab view record parses its lanes and keeps an absent daemon version out', () => {
    const view = { tab: 'w1:t1', column: 'main', lanes: [lane], at: 5000 };
    assert.deepEqual(parseTabViewRecord(view), { kind: 'ok', value: view });
    assert.deepEqual(parseTabViewRecord({ ...view, daemonVersion: '1.2.3' }), { kind: 'ok', value: { ...view, daemonVersion: '1.2.3' } });
    assert.equal(parseTabViewRecord({ ...view, lanes: [{ ...lane, agent: '' }] }).kind, 'err');
    assert.equal(parseTabViewRecord({ ...view, lanes: 'none' }).kind, 'err');
    assert.equal(parseTabViewRecord(null).kind, 'err');
});
