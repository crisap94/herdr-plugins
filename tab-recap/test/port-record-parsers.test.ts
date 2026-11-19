import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLaneWebRecord, parseTabLaneRecord } from '#src/ports/tab-views.ts';
import { parsePairRecord } from '#src/ports/verdicts.ts';

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