import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compactionInput, type CompactionMaterial } from './material.ts';
import { factsOf } from '../../tab-recap/src/recap/application/brief-coverage.ts';
import { FORBIDDEN, vetted } from '../../tab-recap/src/recap/application/compaction-brief.ts';
import { settledBefore } from '../../packages/session-ledger/src/recap/domain/boundary.ts';
import { instant, type Instant } from '../../packages/session-ledger/src/recap/domain/time.ts';
import { textOf } from '../../packages/session-ledger/src/recap/domain/text.ts';
import { BRIEF_INSTRUCTIONS } from '../../tab-recap/src/adapters/job/prompts/brief-instructions.ts';
import { inputWordsIn, isEnglish, isPlain, ownOf, tokensOf, unknownTokens } from './checks.ts';

interface Pointer {
    readonly index: number;
    readonly text: string;
    readonly section?: string;
    readonly why?: string | null;
}

interface Expected {
    readonly language: string;
    readonly session_language: string;
    readonly note: string | null;
    readonly goal: Pointer;
    readonly must_keep: readonly Pointer[];
    readonly reasons: readonly Pointer[];
    readonly waiting_on_operator: readonly Pointer[];
    readonly settled: readonly Pointer[];
    readonly must_not_reopen: readonly Pointer[];
    readonly planted: {
        readonly reasons: readonly Pointer[];
        readonly bait: readonly { readonly about: string; readonly invented: readonly string[] }[];
        readonly forbidden_not_in_own: readonly string[];
        readonly forbidden_in_own: readonly string[];
        readonly gate_conflict: boolean;
        readonly long_ledger: boolean;
    };
    readonly must_keep_characters: number;
    readonly blocking_outside_window: number;
    readonly allowed_tokens: readonly string[];
}

interface Row {
    readonly id: string;
    readonly plants: readonly string[];
    readonly tags: readonly string[];
    readonly input: CompactionMaterial;
    readonly expected: Expected;
}

const BLOCKING: ReadonlySet<string> = new Set(['goal', 'needs', 'decisions', 'rules']);
const SECTIONS: ReadonlySet<string> = new Set(['goal', 'now', 'needs', 'done', 'decisions', 'next', 'links', 'rules']);
const PLANNED: Readonly<Record<string, number>> = { 'plain': 4, 'long-ledger': 4, 'reason-easy-to-drop': 6, 'settled-reads-open': 5, 'forbidden-name-in-input': 4, 'non-english-session': 3, 'invented-path-bait': 2 };
const breakAtOf = (input: CompactionMaterial): Instant | null => (input.lastBreakAt === null ? null : instant(input.lastBreakAt));
const REAL = /crisap|homelab|herdr|cadre|\/home\/|tab-recap|anthropic|openai/iu;

const path = process.argv[2] ?? join(import.meta.dir, 'dataset.jsonl');
const rows = readFileSync(path, 'utf8').split('\n').filter((line) => line !== '').map((line) => JSON.parse(line) as Row);
const problems: string[] = [];
const fail = (id: string, what: string): void => {
    problems.push(`${id}: ${what}`);
};
const word = (value: string): RegExp => new RegExp(`\\b${value}\\b`, 'iu');

const ids = new Set<string>();
const plantCount: Record<string, number> = {};
console.log('id     size    lang facts keep reasons wait settled doc_bytes recent_chars omitted keep_chars oracle_len');
for (const row of rows) {
    const { id, input, expected } = row;
    if (ids.has(id)) fail(id, 'duplicate id');
    ids.add(id);
    for (const plant of row.plants) plantCount[plant] = (plantCount[plant] ?? 0) + 1;
    if (row.plants.some((plant) => PLANNED[plant] === undefined)) fail(id, 'unknown plant');
    if (!Array.isArray(row.tags) || row.tags.length === 0) fail(id, 'no tags');

    let document = '';
    try {
        document = compactionInput(input);
    } catch (error) {
        fail(id, `the plugin's input builder refused it: ${String(error)}`);
        continue;
    }
    if (!document.startsWith('<compaction_input version="2">')) fail(id, 'unexpected document head');
    const own = ownOf(input);
    const history = input.history;

    for (const fact of history) {
        if (!SECTIONS.has(fact.section)) fail(id, `unknown section ${fact.section}`);
        if (fact.text === '') fail(id, 'empty fact text');
        if ((fact.state === 'closed') !== (fact.closedAt !== null) || (fact.state === 'closed') !== (fact.closedWhy !== null)) fail(id, `closed fields disagree: ${fact.text}`);
        if (fact.section === 'decisions' && fact.why === null) fail(id, `decision without a reason: ${fact.text}`);
        if (fact.lastAt < fact.firstAt || fact.lastAt > input.clock.now || (fact.closedAt !== null && (fact.closedAt < fact.lastAt || fact.closedAt > input.clock.now))) fail(id, `times out of order: ${fact.text}`);
    }
    if (new Set(history.map((fact) => `${fact.section}|${fact.text}`)).size !== history.length) fail(id, 'duplicate fact');
    if (history.some((fact, at) => at > 0 && fact.lastAt > (history[at - 1]?.lastAt ?? 0))) fail(id, 'history is not newest first');
    if (history.length > 300) fail(id, 'history over the plugin limit of 300');
    if (history.filter((fact) => fact.state === 'open' && fact.section === 'goal').length !== 1) fail(id, 'not exactly one open goal');

    const points = (name: string, list: readonly Pointer[], test: (fact: CompactionMaterial['history'][number], pointer: Pointer) => boolean): void => {
        for (const pointer of list) {
            const fact = history[pointer.index];
            if (fact === undefined || fact.text !== pointer.text) fail(id, `${name}: index ${pointer.index} does not hold "${pointer.text}"`);
            else if (!test(fact, pointer)) fail(id, `${name}: index ${pointer.index} has the wrong state, section or reason`);
            else if (!document.includes(fact.text)) fail(id, `${name}: the document does not hold "${fact.text}"`);
        }
    };
    points('goal', [expected.goal], (fact) => fact.state === 'open' && fact.section === 'goal');
    points('must_keep', expected.must_keep, (fact, pointer) => fact.state === 'open' && BLOCKING.has(fact.section) && fact.section === pointer.section);
    points('reasons', expected.reasons, (fact, pointer) => fact.section === 'decisions' && fact.why === pointer.why && fact.why !== null && document.includes(fact.why));
    points('waiting_on_operator', expected.waiting_on_operator, (fact) => fact.state === 'open' && fact.section === 'needs');
    points('settled', expected.settled, (fact) => settledBefore(fact.closedAt, breakAtOf(input)));
    points('must_not_reopen', expected.must_not_reopen, (fact) => settledBefore(fact.closedAt, breakAtOf(input)));
    points('planted.reasons', expected.planted.reasons, (fact, pointer) => fact.state === 'open' && fact.why === pointer.why);

    const checked = factsOf(history);
    const window = history.map((fact, index) => ({ fact, index })).filter(({ fact }) => fact.state === 'open' && ['goal', 'now', 'needs', 'decisions', 'next', 'rules'].includes(fact.section)).slice(0, checked.length);
    const keepNow = window.filter(({ fact }) => BLOCKING.has(fact.section)).map(({ index }) => index);
    if (JSON.stringify(keepNow) !== JSON.stringify(expected.must_keep.map((pointer) => pointer.index))) fail(id, 'must_keep is not the blocking facts of the plugin window');
    const reasonsNow = expected.must_keep.filter((pointer) => pointer.section === 'decisions').map((pointer) => pointer.index);
    if (JSON.stringify(reasonsNow) !== JSON.stringify(expected.reasons.map((pointer) => pointer.index))) fail(id, 'reasons do not match the kept decisions');
    const settledNow = history.flatMap((fact, index) => (settledBefore(fact.closedAt, breakAtOf(input)) ? [index] : []));
    if (JSON.stringify(settledNow) !== JSON.stringify(expected.settled.map((pointer) => pointer.index))) fail(id, 'settled differs from the plugin rule');
    if (!expected.must_keep.some((pointer) => pointer.index === expected.goal.index)) fail(id, 'the goal is not in must_keep');
    if (expected.waiting_on_operator.some((pointer) => !expected.must_keep.some((kept) => kept.index === pointer.index))) fail(id, 'a waiting fact is not in must_keep');
    if (expected.note !== input.note) fail(id, 'note differs');
    if (document.includes('<note>') !== (expected.note !== null)) fail(id, 'the document note differs');
    if (input.current.goal !== expected.goal.text) fail(id, 'current goal differs');

    const recentText = input.recent.map((entry) => entry.text).join('\n');
    for (const planted of expected.planted.reasons) {
        if (!expected.reasons.some((reason) => reason.index === planted.index)) fail(id, 'planted reason is not in reasons');
        if (recentText.includes(planted.why ?? '') || recentText.includes(planted.text)) fail(id, 'planted reason is repeated in the turns');
        if (input.current.decisions.includes(textOf(planted.text))) fail(id, 'planted decision is in the current picture');
    }
    if (row.plants.includes('reason-easy-to-drop') !== (expected.planted.reasons.length > 0)) fail(id, 'reason plant and tag disagree');
    if (row.plants.includes('settled-reads-open') !== (expected.must_not_reopen.length > 0)) fail(id, 'settled plant and tag disagree');
    for (const settled of expected.must_not_reopen) if (recentText.includes(settled.text)) fail(id, 'planted settled fact is repeated in the turns');
    if (row.plants.includes('invented-path-bait') !== (expected.planted.bait.length > 0)) fail(id, 'bait plant and tag disagree');
    for (const bait of expected.planted.bait) {
        if (!document.includes(bait.about)) fail(id, `bait subject missing: ${bait.about}`);
        if (bait.invented.some((token) => !unknownTokens(bait.invented.join(' '), expected.allowed_tokens).includes(token))) fail(id, `an invented path is in the document: ${bait.about}`);
    }

    if (JSON.stringify(tokensOf(document)) !== JSON.stringify(expected.allowed_tokens)) fail(id, 'allowed_tokens differ from the document');
    const forbidden = row.plants.includes('forbidden-name-in-input');
    const outside = [input.agent.label, input.note ?? '', ...input.recent.map((entry) => entry.what ?? '')].join('\n');
    if (!forbidden && (FORBIDDEN.test(own) || FORBIDDEN.test(outside) || inputWordsIn(own, '').length > 0)) fail(id, 'a forbidden word in an item that does not plant one');
    if (forbidden !== (expected.planted.forbidden_not_in_own.length + expected.planted.forbidden_in_own.length > 0)) fail(id, 'forbidden plant and tag disagree');
    for (const name of expected.planted.forbidden_not_in_own) {
        if (!word(name).test(document)) fail(id, `forbidden word ${name} is not in the document`);
        if (word(name).test(own)) fail(id, `forbidden word ${name} is in the session's own text`);
        const probe = `I want you to keep the ${name} in mind.`;
        if (name !== 'tools' && vetted(probe as never, own as never).kind !== 'bad') fail(id, `the gate does not refuse ${name}`);
        if (name === 'tools' && inputWordsIn(probe, own).length === 0) fail(id, 'the input-word check does not catch tools');
    }
    for (const name of expected.planted.forbidden_in_own) {
        if (!word(name).test(own)) fail(id, `exempt word ${name} is not in the session's own text`);
        if (vetted(`I want you to keep the ${name} in mind.` as never, own as never).kind !== 'ok') fail(id, `the gate refuses the exempt word ${name}`);
    }
    if (expected.planted.gate_conflict && vetted((input.note ?? '') as never, own as never).kind !== 'bad') fail(id, 'the note of a gate-conflict item passes the gate');

    if (isEnglish(own) !== (expected.session_language === 'en')) fail(id, `the language check and session_language ${expected.session_language} disagree`);
    if (row.plants.includes('non-english-session') !== (expected.session_language !== 'en')) fail(id, 'language plant and tag disagree');
    if (expected.language !== 'en') fail(id, 'the brief language must be en');

    const oracle = `I want you to keep these when you summarize. ${expected.must_keep.map((pointer) => {
        const why = history[pointer.index]?.why ?? null;
        const text = pointer.text.replace(/[.?!]$/u, '');
        return why === null ? `${text}.` : `We decided: ${text}, because ${why}.`;
    }).join(' ')}`;
    if (!isPlain(oracle)) fail(id, 'the facts themselves carry markup');
    if (unknownTokens(oracle, expected.allowed_tokens).length > 0) fail(id, `a kept fact holds a token outside allowed_tokens: ${unknownTokens(oracle, expected.allowed_tokens).join(' ')}`);
    if (vetted(oracle as never, own as never).kind !== 'ok') fail(id, 'a brief made of the kept facts is refused by the gate');
    if (expected.session_language === 'en' && !isEnglish(oracle)) fail(id, 'a brief made of the kept facts is not seen as English');
    if (expected.planted.long_ledger !== (expected.must_keep_characters > 2600)) fail(id, `long_ledger and must_keep_characters ${expected.must_keep_characters} disagree`);
    if (expected.must_keep_characters !== expected.must_keep.reduce((sum, pointer) => sum + pointer.text.length + (history[pointer.index]?.why?.length ?? 0), 0)) fail(id, 'must_keep_characters is wrong');

    for (const token of expected.allowed_tokens) if (/^https?:/u.test(token) && !/^https?:\/\/[\w.-]+\.test(\/|$)/u.test(token)) fail(id, `a URL outside .test: ${token}`);
    if (REAL.test(JSON.stringify(row))) fail(id, 'a real name or path');
    if (input.agent.repo !== null || input.agent.branch !== null) fail(id, 'the plugin passes repo and branch as null');

    const omitted = /<recent[^>]*omitted="(\d+)"/u.exec(document)?.[1] ?? '0';
    const size = row.tags.find((tag) => tag.startsWith('size:'))?.slice(5) ?? '?';
    console.log([id, size.padEnd(7), expected.session_language.padEnd(4), String(history.length).padStart(5), String(expected.must_keep.length).padStart(4), String(expected.reasons.length).padStart(7), String(expected.waiting_on_operator.length).padStart(4), String(expected.settled.length).padStart(7), String(Buffer.byteLength(document)).padStart(9), String(recentText.length).padStart(12), omitted.padStart(7), String(expected.must_keep_characters).padStart(10), String(oracle.length).padStart(10)].join(' '));
}

if (rows.length !== 24) problems.push(`expected 24 items, found ${rows.length}`);
for (const [plant, count] of Object.entries(PLANNED)) if (plantCount[plant] !== count) problems.push(`plant ${plant}: ${plantCount[plant] ?? 0} items, planned ${count}`);
console.log(`plants: ${JSON.stringify(plantCount)}`);
console.log(`instructions: ${BRIEF_INSTRUCTIONS.length} characters`);
if (problems.length > 0) {
    console.error(problems.join('\n'));
    process.exit(1);
}
console.log(`ok: ${rows.length} items checked`);
