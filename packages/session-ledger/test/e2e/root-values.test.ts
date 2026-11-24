import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as root from '@stateforge-labs/session-ledger';

const REACHED: readonly (readonly [string, unknown, string])[] = [
    ['ACTIVE', root.ACTIVE, 'object'],
    ['anchorGate', root.anchorGate, 'object'],
    ['answeredGate', root.answeredGate, 'object'],
    ['autocompactState', root.autocompactState, 'function'],
    ['AutocompactSweep', root.AutocompactSweep, 'function'],
    ['batch', root.batch, 'function'],
    ['callOf', root.callOf, 'function'],
    ['closeEvidenceGate', root.closeEvidenceGate, 'object'],
    ['closeEvidenceOr', root.closeEvidenceOr, 'function'],
    ['closeWhyGate', root.closeWhyGate, 'object'],
    ['COVERAGE_BY_DEFAULT', root.COVERAGE_BY_DEFAULT, 'string'],
    ['detailOf', root.detailOf, 'function'],
    ['duplicate', root.duplicate, 'object'],
    ['duplicateGate', root.duplicateGate, 'object'],
    ['engineOver', root.engineOver, 'function'],
    ['gatekeeper', root.gatekeeper, 'function'],
    ['gatesOf', root.gatesOf, 'function'],
    ['itemGate', root.itemGate, 'object'],
    ['jevFrom', root.jevFrom, 'function'],
    ['KEEP_NEWEST_RANGE', root.KEEP_NEWEST_RANGE, 'object'],
    ['KINDS_DEFAULT', root.KINDS_DEFAULT, 'object'],
    ['LANE_STATUSES', root.LANE_STATUSES, 'object'],
    ['LEDGER_GATES', root.LEDGER_GATES, 'object'],
    ['legacyCreateEngine', root.legacyCreateEngine, 'function'],
    ['legacyPlugsOf', root.legacyPlugsOf, 'function'],
    ['listedIn', root.listedIn, 'function'],
    ['live', root.live, 'function'],
    ['MINIMUM_DEFAULT', root.MINIMUM_DEFAULT, 'number'],
    ['moneyOf', root.moneyOf, 'function'],
    ['narrator', root.narrator, 'object'],
    ['NEXT_HOURS_RANGE', root.NEXT_HOURS_RANGE, 'object'],
    ['notSpecific', root.notSpecific, 'object'],
    ['outcomesOf', root.outcomesOf, 'function'],
    ['parseAutocompactKinds', root.parseAutocompactKinds, 'function'],
    ['parseCheckedFact', root.parseCheckedFact, 'function'],
    ['parseCloseEvidence', root.parseCloseEvidence, 'function'],
    ['parseCoverageBy', root.parseCoverageBy, 'function'],
    ['parseCoverageRecord', root.parseCoverageRecord, 'function'],
    ['parseGatePercent', root.parseGatePercent, 'function'],
    ['parseJevModel', root.parseJevModel, 'function'],
    ['parseJevUrl', root.parseJevUrl, 'function'],
    ['parseLaneStatusAtDecision', root.parseLaneStatusAtDecision, 'function'],
    ['parseRepairMode', root.parseRepairMode, 'function'],
    ['parseShadowKinds', root.parseShadowKinds, 'function'],
    ['parseSkipRow', root.parseSkipRow, 'function'],
    ['parseStoredDecisionRow', root.parseStoredDecisionRow, 'function'],
    ['pronounOpener', root.pronounOpener, 'object'],
    ['prunedWriterView', root.prunedWriterView, 'function'],
    ['READBACK', root.READBACK, 'object'],
    ['RECAP_CAUSES', root.RECAP_CAUSES, 'object'],
    ['RecapJob', root.RecapJob, 'function'],
    ['repairModeOr', root.repairModeOr, 'function'],
    ['replyOf', root.replyOf, 'function'],
    ['SKIP_GATES', root.SKIP_GATES, 'object'],
    ['staged', root.staged, 'function'],
    ['stageFor', root.stageFor, 'function'],
    ['submitted', root.submitted, 'function'],
    ['submittedStage', root.submittedStage, 'function'],
    ['toolOf', root.toolOf, 'function'],
    ['unknownIdGate', root.unknownIdGate, 'object'],
    ['unreachable', root.unreachable, 'function'],
    ['unreadableOf', root.unreadableOf, 'function'],
    ['unresolved', root.unresolved, 'object'],
    ['withoutWhy', root.withoutWhy, 'object'],
    ['wrongLanguage', root.wrongLanguage, 'object'],
];

test('every root value the host reaches through the root is defined and has the kind of value it had at its source', () => {
    for (const [name, value, kind] of REACHED) {
        assert.equal(typeof value, kind, name);
    }
});

test('the reached values are all exported by the root under the name they are listed by', () => {
    const exported = new Set(Object.keys(root));
    assert.deepEqual(REACHED.filter(([name]) => !exported.has(name)).map(([name]) => name), []);
});
