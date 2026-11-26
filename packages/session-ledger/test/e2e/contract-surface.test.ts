import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import ts from 'typescript';
import * as root from '@stateforge-labs/session-ledger';
import { textOf } from '@stateforge-labs/session-ledger';
import * as timing from '@stateforge-labs/session-ledger/compaction-timing';
import { notFound, text } from '@stateforge-labs/session-ledger/testkit';
import { sourcePathOf } from '@stateforge-labs/session-ledger';

const packageRoot = join(dirname(new URL(import.meta.url).pathname), '..', '..');
const surfaceDir = join(packageRoot, 'test', 'e2e', 'surface');

const ROOT_VALUES = [
    'ACTIVE',
    'ADVANCED',
    'ANCHOR_CHARS',
    'ASK_BACK_CHARS',
    'AT_ONCE',
    'AUTO_ORDER',
    'AutocompactSweep',
    'BACKEND_IDS',
    'CAPS',
    'CEILING_DEFAULT',
    'CHUNK_CHARS',
    'CLOSED_SHOWN_MS',
    'CLOSED_WHY',
    'COMPACTABLE',
    'CONTEXT_CHARS',
    'COOLDOWN_DEFAULT_MS',
    'COVERAGE_BY_DEFAULT',
    'CursorCarry',
    'DEBOUNCE_OFF',
    'DEFAULT_PIPELINE',
    'EVIDENCE_CHARS',
    'FRESH',
    'FULL_WRITER_VIEW',
    'HARNESS_BY_ID',
    'HINT_DEFAULT',
    'HINT_MAX',
    'HINT_MIN',
    'INSTALLABLE_HARNESS_NAMES',
    'JOB_HARNESSES',
    'KEEP_NEWEST_RANGE',
    'KINDS_DEFAULT',
    'LANE_STATUSES',
    'LEDGER_GATES',
    'LEGACY_MODEL_KEYS',
    'MAX_FACT_QUESTIONS',
    'MAX_STUBS',
    'MAX_WORDS',
    'MINIMUM_DEFAULT',
    'MINIMUM_MAX',
    'MINIMUM_MIN',
    'MISSED_FACTS',
    'MISSED_FACTS_DEFAULT',
    'MODEL_DEFAULTS',
    'MUST_BE_LOW',
    'NEXT_HOURS_RANGE',
    'NOTE_LIMIT',
    'NOTHING_IN_FLIGHT',
    'NOT_ADVANCED',
    'NOT_AWAITING',
    'NO_RUNNING',
    'NO_SECTIONS',
    'NO_STATS',
    'OLD_CONTRACT',
    'ONE_MUST_BE_HIGH',
    'PACING_TURN',
    'PIPELINES',
    'PLUGIN_WITHIN_MS',
    'QUOTE_CHARS',
    'READBACK',
    'RECAP_CAUSES',
    'RECONCILE_EVERY',
    'REGISTERED_KINDS',
    'REGISTERED_NAMES',
    'RecapJob',
    'Reconciling',
    'SCREEN_PREFIX',
    'SECTIONS',
    'SECTION_IDS',
    'SEEN_BEFORE',
    'SKIP_GATES',
    'STORY_TOO_LONG',
    'STORY_WORDS',
    'STYLES',
    'STYLE_DEFAULT',
    'STYLE_NUMBERS',
    'SafePointWatch',
    'TAIL_CHARS',
    'THIN_CHARS',
    'THRESHOLDS',
    'TRANSCRIPT_BUDGET',
    'TranscriptRegistry',
    'UNREAD',
    'WHY_WORDS',
    'WRITER_CLOSES',
    'acceptedRepair',
    'accomplishedOf',
    'addStats',
    'agentKindOf',
    'anchorGate',
    'anchorQuotedIn',
    'anchorSource',
    'answerTextOf',
    'answeredBy',
    'answeredGate',
    'apply',
    'askBackFor',
    'attribute',
    'autocompactState',
    'awaitedNames',
    'backendRecord',
    'backgroundItem',
    'backgroundLabel',
    'backgroundTool',
    'batch',
    'blankRecap',
    'brand',
    'callOf',
    'candidatesOf',
    'capStubs',
    'capabilityWording',
    'capable',
    'causeOf',
    'ceilingOf',
    'chapterStart',
    'chunksOf',
    'clean',
    'clipHead',
    'clipTurn',
    'closeEvidenceGate',
    'closeEvidenceOr',
    'closeWhyGate',
    'compactableKinds',
    'compactedFrom',
    'contextOf',
    'correctionDocument',
    'correctionOf',
    'countOf',
    'createEngine',
    'curate',
    'curationOf',
    'curatorInput',
    'cursorOf',
    'cutNote',
    'debounceOf',
    'deduplicated',
    'detailOf',
    'docIdOf',
    'documentId',
    'duplicate',
    'duplicateGate',
    'duration',
    'elapsed',
    'element',
    'engineOver',
    'enumerate',
    'enumerateAsked',
    'enumerateInput',
    'enumeratesJob',
    'environmentName',
    'err',
    'exitCodeOf',
    'extract',
    'extractPiped',
    'factIdOf',
    'failureCauseOf',
    'flightDetail',
    'flightOf',
    'flightReason',
    'fold',
    'foldSwept',
    'foldedOf',
    'foldedRun',
    'forTask',
    'foregroundOf',
    'gateName',
    'gatekeeper',
    'gatesOf',
    'grewOf',
    'groundOf',
    'harnessChoiceLabels',
    'harnessLabels',
    'hasAvailabilityMark',
    'hasModel',
    'hasRecap',
    'hasReference',
    'headlineOf',
    'hintFor',
    'hintOf',
    'hintSetting',
    'historyOf',
    'holdingDetail',
    'holdsLane',
    'inFlightReason',
    'inputOf',
    'installableHarnessSentence',
    'instant',
    'isClosedWhy',
    'isOpen',
    'isScreenSource',
    'isSection',
    'isSpecific',
    'isUnknown',
    'isoSecond',
    'itemGate',
    'itemOf',
    'itemsOf',
    'jaccard',
    'jevFrom',
    'jobContractOf',
    'jobEnvironmentNames',
    'joinedDetail',
    'judge',
    'keepNewestOf',
    'keepsNote',
    'keptDetail',
    'keptGrouping',
    'keptOf',
    'kindsWith',
    'laneOf',
    'laneSet',
    'languageOfLine',
    'leaf',
    'legacyCreateEngine',
    'legacyPlugsOf',
    'listedIn',
    'live',
    'localTime',
    'marksOf',
    'millisecondsWithin',
    'modelOf',
    'moneyOf',
    'must',
    'narrator',
    'newestOf',
    'nextHoursOf',
    'notSpecific',
    'numbered',
    'objectIn',
    'observedFrom',
    'ok',
    'outcomesOf',
    'overridingDetail',
    'pacedOf',
    'parseAnswer',
    'parseAutocompactCeiling',
    'parseAutocompactKinds',
    'parseAutocompactPercent',
    'parseAutocompactStyle',
    'parseBackoff',
    'parseBriefRetention',
    'parseCeilingPolicy',
    'parseCheckedFact',
    'parseCloseEvidence',
    'parseCompactionId',
    'parseContinuationNote',
    'parseCooldownMs',
    'parseCount',
    'parseCoverageBy',
    'parseCoverageRecord',
    'parseDebounce',
    'parseDecisionId',
    'parseDirectory',
    'parseDuration',
    'parseFailureCause',
    'parseFields',
    'parseGatePercent',
    'parseHarnessKind',
    'parseHidden',
    'parseIdleHold',
    'parseInstant',
    'parseJevModel',
    'parseJevUrl',
    'parseLaneStatusAtDecision',
    'parseMilliseconds',
    'parseMissedFacts',
    'parseNonEmptyText',
    'parseNoteLimit',
    'parseOffer',
    'parsePacing',
    'parsePipeline',
    'parsePositiveCount',
    'parseProbability',
    'parseRepairMode',
    'parseRestoreText',
    'parseScopeId',
    'parseSessionId',
    'parseSessionKey',
    'parseShadowKinds',
    'parseSkipRow',
    'parseStoredDecisionRow',
    'parseStory',
    'parseText',
    'parseTextOrNull',
    'parseThreshold',
    'parseThrown',
    'parseTokenAmount',
    'parseUsd',
    'parseWatchMode',
    'pendingOf',
    'pick',
    'pieceOf',
    'pipelineOf',
    'placementOf',
    'positiveCount',
    'probabilityWithin',
    'pronounOpener',
    'prunedWriterView',
    'quoted',
    'quotedIn',
    'recapRunningOf',
    'recappedOf',
    'reconcileInput',
    'reconcileRequest',
    'reconcileTask',
    'reconciliationOf',
    'refusedIn',
    'registeredKindOf',
    'renderRecap',
    'repairModeOr',
    'replyOf',
    'retriesTargeted',
    'retryFor',
    'runningCount',
    'runningOf',
    'said',
    'sameTask',
    'saying',
    'scopeIdOf',
    'sectionOf',
    'serializeHidden',
    'sessionKeyOf',
    'settledBefore',
    'severalOf',
    'shareOf',
    'similarTokensOf',
    'sizeOf',
    'sourcePathOf',
    'splitReason',
    'stageFor',
    'staged',
    'stillTrueOf',
    'storyRepair',
    'stubId',
    'styleOf',
    'subjectOf',
    'submitted',
    'submittedStage',
    'sweepOf',
    'targetOf',
    'targetSetting',
    'taskFactsOf',
    'text',
    'textOf',
    'throwingLedger',
    'tidy',
    'tokensOf',
    'toolOf',
    'touchedFiles',
    'transcriptOf',
    'triggerOf',
    'triggersOf',
    'turnsOf',
    'unknown',
    'unknownIdGate',
    'unreachable',
    'unreadable',
    'unreadableOf',
    'unresolved',
    'usdOf',
    'wanted',
    'windowOf',
    'windowSetting',
    'withNote',
    'withoutWhy',
    'wordJaccard',
    'wordTokensOf',
    'wordsOf',
    'writerContext',
    'writerFacts',
    'wrongLanguage',
];

const TIMING_VALUES = ['QUESTIONS', 'SWEEP_EVERY', 'continuationNote', 'gateOf', 'policyFrom', 'tuningFrom', 'verdictOf'];

function compilerOptions(): ts.CompilerOptions {
    const configPath = join(packageRoot, 'tsconfig.json');
    const config = ts.readConfigFile(configPath, (path) => ts.sys.readFile(path));
    assert.equal(config.error, undefined);
    return ts.parseJsonConfigFileContent(config.config, ts.sys, packageRoot).options;
}

function fixtures(): readonly string[] {
    return readdirSync(surfaceDir).filter((name) => name.endsWith('.types.ts')).toSorted().map((name) => join(surfaceDir, name));
}

function errorsOf(rootNames: readonly string[], seeded: ReadonlyMap<string, string> = new Map()): readonly string[] {
    const options = compilerOptions();
    const host = ts.createCompilerHost(options);
    const readFile = host.readFile.bind(host);
    host.readFile = (path): string | undefined => seeded.get(path) ?? readFile(path);
    const fileExists = host.fileExists.bind(host);
    host.fileExists = (path): boolean => seeded.has(path) || fileExists(path);
    const program = ts.createProgram({ rootNames, options, host });
    return ts.getPreEmitDiagnostics(program).map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
}

test('the root exports exactly the 370 values', () => {
    assert.deepEqual(Object.keys(root).toSorted(), ROOT_VALUES);
});

test('parseRestoreText refuses a non-string and brands any other string', () => {
    assert.deepEqual(root.parseRestoreText(42), { kind: 'err', error: { kind: 'not-a-string' } });
    assert.deepEqual(root.parseRestoreText(undefined), { kind: 'err', error: { kind: 'not-a-string' } });
    assert.deepEqual(root.parseRestoreText(''), { kind: 'ok', value: '' });
    assert.deepEqual(root.parseRestoreText('## Restore\nbody'), { kind: 'ok', value: '## Restore\nbody' });
});

test('the six values of the facade step keep the behaviour of main', () => {
    assert.equal(typeof root.createEngine, 'function');
    assert.deepEqual(root.FULL_WRITER_VIEW, { kind: 'full' });
    assert.deepEqual(root.SECTIONS.map((section) => section.id), ['goal', 'now', 'needs', 'done', 'decisions', 'next', 'links']);
    assert.equal(root.sectionOf(textOf('## Waiting on you')), 'needs');
    assert.equal(root.isScreenSource(sourcePathOf('screen:1')), true);
    assert.equal(root.isScreenSource(sourcePathOf('/a.jsonl')), false);
    assert.equal(typeof root.saying({ why: 'not-found', what: text('transcript') }), 'string');
});

test('every surface fixture compiles', () => {
    const names = fixtures();
    assert.ok(names.some((name) => name.endsWith('fnd-2a.types.ts')));
    assert.deepEqual(errorsOf(names), []);
});

test('a fixture that names a missing type does not compile', () => {
    const seeded = join(surfaceDir, 'seeded-missing.types.ts');
    const source = "import type { NotAContractName } from '@stateforge-labs/session-ledger';\nexport type Probe = NotAContractName;\n";
    const errors = errorsOf([seeded], new Map([[seeded, source]]));
    assert.ok(errors.some((message) => message.includes('NotAContractName')));
});

test('a fixture that breaks a type assertion does not compile', () => {
    const seeded = join(surfaceDir, 'seeded-false.types.ts');
    const source = "import type { Engine, SessionKey } from '@stateforge-labs/session-ledger';\ntype Holds<T extends true> = T;\nexport type Probe = Holds<Parameters<Engine['turnEnded']>[1] extends SessionKey ? true : false>;\n";
    const errors = errorsOf([seeded], new Map([[seeded, source]]));
    assert.ok(errors.length > 0);
});

test('the five parsers refuse a non-string and a blank string and brand any other string', () => {
    const parsers = [root.parseScopeId, root.parseSessionKey, root.parseHarnessKind, root.parseSessionId, root.parseDirectory];
    for (const parse of parsers) {
        assert.deepEqual(parse(42), { kind: 'err', error: { kind: 'not-a-string' } });
        assert.deepEqual(parse(null), { kind: 'err', error: { kind: 'not-a-string' } });
        assert.deepEqual(parse(''), { kind: 'err', error: { kind: 'empty' } });
        assert.deepEqual(parse(' \t\n'), { kind: 'err', error: { kind: 'empty' } });
        assert.deepEqual(parse(' a '), { kind: 'ok', value: ' a ' });
    }
});

test('ok, err, instant, unknown, isUnknown and UNREAD keep the shapes of main', () => {
    assert.deepEqual(root.ok(1), { kind: 'ok', value: 1 });
    assert.deepEqual(root.err('x'), { kind: 'err', error: 'x' });
    assert.equal(root.instant(1234), 1234);
    const failed = root.unknown(notFound('transcript'));
    assert.deepEqual(failed, { kind: 'unknown', why: { why: 'not-found', what: 'transcript' } });
    assert.equal(root.isUnknown(failed), true);
    assert.equal(root.isUnknown(root.ok(1)), false);
    assert.deepEqual(root.UNREAD, { cursor: 0, tail: null });
});

test('the value exports of compaction-timing are the seven that exist', () => {
    assert.deepEqual(Object.keys(timing).toSorted(), TIMING_VALUES);
});

test('the compaction-timing values keep the behaviour they had in the plugin', () => {
    assert.equal(timing.SWEEP_EVERY, 5);
    assert.deepEqual([...timing.QUESTIONS.keys()].toSorted(), ['announces_continuation', 'asks_detailed_choice', 'changes_subject', 'closes_request', 'needs_verbatim', 'stuck']);
    assert.equal(timing.verdictOf({ announces_continuation: 0.1, asks_detailed_choice: 0.1, needs_verbatim: 0.1, stuck: 0.1, closes_request: 0.9, changes_subject: 0.1 }), 'compact');
    assert.equal(timing.verdictOf({}), 'wait');
    assert.equal(timing.policyFrom(() => undefined).mode, 'shadow');
    assert.equal(timing.tuningFrom(() => undefined).style, 'balanced');
    assert.equal(typeof timing.gateOf, 'function');
    assert.equal(timing.continuationNote({ kind: 'none' }, []), null);
});
