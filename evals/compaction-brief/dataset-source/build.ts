import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { compactionInput, type CompactionMaterial } from '../../../tab-recap/src/recap/application/compaction-input.ts';
import { factsOf } from '../../../tab-recap/src/recap/application/brief-coverage.ts';
import { settledBefore } from '../../../packages/session-ledger/src/recap/domain/boundary.ts';
import { instant } from '../../../packages/session-ledger/src/recap/domain/time.ts';
import { textOf, type Text } from '../../../packages/session-ledger/src/recap/domain/text.ts';
import { CAPS, type ListSection, type RecapSections } from '../../../packages/session-ledger/src/recap/domain/shape.ts';
import type { HistoryFact } from '../../../packages/session-ledger/src/ports/ledger.ts';
import type { Entry } from '../../../packages/session-ledger/src/ports/transcripts.ts';
import { tokensOf } from '../checks.ts';
import { ITEMS, type ClosedWhy, type ItemSpec, type Section } from './items.ts';
import { PHRASES, PROJECTS, type Project } from './projects.ts';

const NOW = Date.UTC(2026, 10, 10, 16, 0, 0);
const MINUTE = 60_000;
const COVERED: ReadonlySet<string> = new Set(['goal', 'now', 'needs', 'decisions', 'next', 'rules']);
const BLOCKING: ReadonlySet<string> = new Set(['goal', 'needs', 'decisions', 'rules']);
const WINDOW = 40;

interface Raw extends HistoryFact {
    readonly key: string | null;
    readonly asks: boolean;
    readonly order: number;
}

function seeded(name: string): () => number {
    let state = 2166136261;
    for (const char of name) state = Math.imul(state ^ char.charCodeAt(0), 16777619) >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
        mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
        return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
    };
}

function buildItem(spec: ItemSpec): unknown {
    const project = PROJECTS[spec.project] as Project;
    const phrases = PHRASES[project.language];
    const random = seeded(spec.id);
    const between = (low: number, high: number): number => low + Math.floor(random() * (high - low + 1));
    const pick = <T>(values: readonly T[]): T => values[Math.floor(random() * values.length)] as T;
    const span = spec.spanMinutes * MINUTE;
    const start = NOW - span;
    const breakAt = spec.breakShare === undefined ? null : instant(Math.round(NOW - span * spec.breakShare));
    const raws: Raw[] = [];
    let order = 0;

    const open = (section: Section, text: string, why: string | null, asks: boolean, key: string | null, firstAt: number, lastAt: number): void => {
        raws.push({ section, text: textOf(text), why: why === null ? null : textOf(why), state: 'open', closedWhy: null, closedAt: null, firstAt: instant(firstAt), lastAt: instant(lastAt), key, asks, order: order++ });
    };
    const closed = (section: Section, text: string, why: string | null, closedWhy: ClosedWhy, key: string | null, firstAt: number, lastAt: number, closedAt: number): void => {
        raws.push({ section, text: textOf(text), why: why === null ? null : textOf(why), state: 'closed', closedWhy, closedAt: instant(closedAt), firstAt: instant(firstAt), lastAt: instant(lastAt), key, asks: false, order: order++ });
    };
    const seenOften = (): readonly [number, number] => {
        const firstAt = start + between(3, Math.floor(spec.spanMinutes * 0.7)) * MINUTE;
        const lastAt = Math.min(NOW - between(2, 30) * MINUTE, firstAt + between(5, Math.floor(spec.spanMinutes * 0.6)) * MINUTE);
        return [firstAt, Math.max(firstAt, lastAt)];
    };

    open('goal', project.goal, null, false, null, start + 2 * MINUTE, NOW - between(2, 9) * MINUTE);
    if (project.oldGoal !== null && spec.size !== 'small') {
        closed('goal', project.oldGoal, null, 'superseded', null, start + MINUTE, start + Math.round(span * 0.08), start + Math.round(span * 0.1));
    }
    for (const at of spec.decisions) {
        const [text, why] = project.decisions[at] as readonly [string, string];
        open('decisions', text, why, false, null, ...seenOften());
    }
    for (const at of spec.needs) {
        const [text, asks] = project.needs[at] as readonly [string, boolean];
        open('needs', text, null, asks, null, ...seenOften());
    }
    for (const at of spec.rules) open('rules', project.rules[at] as string, null, false, null, ...seenOften());
    for (const text of project.now) open('now', text, null, false, null, NOW - between(20, 60) * MINUTE, NOW - between(2, 12) * MINUTE);
    for (const text of project.next) open('next', text, null, false, null, ...seenOften());

    for (const extra of spec.extra ?? []) {
        const why = extra.why ?? null;
        if (extra.when === 'old') {
            const firstAt = start + between(4, 9) * MINUTE;
            open(extra.s, extra.t, why, extra.q === true, extra.key, firstAt, firstAt + between(1, 4) * MINUTE);
        } else if (extra.when === 'recent') {
            const lastAt = NOW - between(3, 14) * MINUTE;
            open(extra.s, extra.t, why, extra.q === true, extra.key, lastAt - between(5, 40) * MINUTE, lastAt);
        } else if (extra.when === 'settled') {
            if (breakAt === null) throw new Error(`${spec.id}: a settled fact needs a break`);
            const closedAt = breakAt - between(6, 25) * MINUTE;
            const lastAt = closedAt - between(1, 5) * MINUTE;
            closed(extra.s, extra.t, why, extra.closedWhy ?? 'done', extra.key, lastAt - between(5, 30) * MINUTE, lastAt, closedAt);
        } else {
            const closedAt = NOW - between(10, 40) * MINUTE;
            const lastAt = closedAt - between(1, 5) * MINUTE;
            closed(extra.s, extra.t, why, extra.closedWhy ?? 'done', extra.key, lastAt - between(5, 30) * MINUTE, lastAt, closedAt);
        }
    }

    const texts = new Set(raws.map((raw) => raw.text));
    const hex = (): string => {
        const value = Array.from({ length: 7 }, () => '0123456789abcdef'[between(0, 15)]).join('');
        return /[a-f]/u.test(value) && /[0-9]/u.test(value) ? value : `${value.slice(0, 5)}a1`;
    };
    const fill = (template: string): Text => {
        const part = pick(project.parts);
        return textOf(template
            .replaceAll('{f}', pick(project.features)).replaceAll('{p}', part.path).replaceAll('{n}', part.name).replaceAll('{b}', pick(project.bugs))
            .replaceAll('{c}', pick(project.commands)).replaceAll('{m}', String(project.mergeBase + between(1, 60))).replaceAll('{br}', pick(project.branches)).replaceAll('{h}', hex()));
    };
    const fresh = (templates: readonly string[]): string => {
        for (let attempt = 0; attempt < 400; attempt += 1) {
            const text = fill(pick(templates));
            if (!texts.has(text)) {
                texts.add(text);
                return text;
            }
        }
        throw new Error(`${spec.id}: no fresh text left`);
    };
    const linkTemplates = ['{p}', `https://${project.host}/${project.name}/-/merge_requests/{m}`, `https://${project.host}/${project.name}/-/pipelines/7{m}`, phrases.branch, phrases.commit, `https://docs.${project.host.replace('git.', '')}/${project.name}/{m}`];
    const freshLink = (): string => {
        for (let attempt = 0; attempt < 400; attempt += 1) {
            const text = fill(pick(linkTemplates));
            if (!texts.has(text)) {
                texts.add(text);
                return text;
            }
        }
        throw new Error(`${spec.id}: no fresh link left`);
    };

    const rest = spec.total - raws.length;
    if (rest < 0) throw new Error(`${spec.id}: total is under the authored facts`);
    const doneFacts: string[] = [];
    for (let at = 0; at < rest; at += 1) {
        const share = at / rest;
        const firstAt = start + between(2, spec.spanMinutes - 4) * MINUTE;
        const lastAt = Math.min(NOW - 2 * MINUTE, firstAt + between(0, 20) * MINUTE);
        const closedAt = Math.min(NOW - MINUTE, lastAt + between(1, 30) * MINUTE);
        if (share < 0.46) {
            const text = fresh(phrases.done);
            doneFacts.push(text);
            open('done', text, null, false, null, firstAt, lastAt);
        } else if (share < 0.66) {
            open('links', freshLink(), null, false, null, firstAt, lastAt);
        } else if (share < 0.83) {
            closed('now', fresh(phrases.now), null, random() < 0.6 ? 'superseded' : 'done', null, firstAt, lastAt, closedAt);
        } else if (share < 0.92) {
            closed('next', fresh(phrases.next), null, random() < 0.7 ? 'done' : 'superseded', null, firstAt, lastAt, closedAt);
        } else {
            closed('needs', fresh(phrases.needs), null, random() < 0.6 ? 'answered' : 'done', null, firstAt, lastAt, closedAt);
        }
    }

    const sorted = raws.toSorted((a, b) => b.lastAt - a.lastAt || a.order - b.order);
    const history: HistoryFact[] = sorted.map(({ section, text, why, state, closedWhy, closedAt, firstAt, lastAt }) => ({ section, text, why, state, closedWhy, closedAt, firstAt, lastAt }));
    const indexOf = (key: string): number => {
        const index = sorted.findIndex((raw) => raw.key === key);
        if (index === -1) throw new Error(`${spec.id}: no fact with key ${key}`);
        return index;
    };

    const newestOpen = (section: ListSection): Text[] => sorted.filter((raw) => raw.state === 'open' && raw.section === section).slice(0, CAPS[section]).map((raw) => raw.text);
    const current: RecapSections = { goal: textOf(project.goal), now: newestOpen('now'), needs: newestOpen('needs'), done: newestOpen('done'), decisions: newestOpen('decisions'), next: newestOpen('next'), links: newestOpen('links'), rules: newestOpen('rules') };

    const recent: Entry[] = [];
    const openNext = sorted.filter((raw) => raw.state === 'open' && raw.section === 'next').map((raw) => raw.text);
    const closing = (spec.turns?.length ?? 0) + 2;
    const stepMinutes = spec.size === 'large' ? 3 : 4;
    let clock = NOW - (spec.exchanges * stepMinutes + closing + 1) * MINUTE;
    const says = (role: 'user' | 'agent', text: string): void => {
        recent.push({ role, text: textOf(text), at: instant(clock) });
        clock += between(20, 55) * 1000;
    };
    for (let at = 0; at < spec.exchanges; at += 1) {
        clock = NOW - ((spec.exchanges - at) * stepMinutes + closing + 1) * MINUTE;
        says('user', pick(phrases.go));
        for (let call = between(0, 5); call > 0; call -= 1) {
            const kind = pick(['read', 'read', 'edit', 'shell', 'shell'] as const);
            const part = pick(project.parts);
            const command = pick(project.commands);
            recent.push(kind === 'shell' ? { role: 'tool', kind, what: textOf(command), text: textOf(/test|eval/u.test(command) ? `${between(8, 260)} pass, 0 fail` : 'exit 0') } : { role: 'tool', kind, what: textOf(part.path), text: textOf('') });
        }
        const told = Array.from({ length: spec.size === 'small' ? 2 : between(2, 4) }, () => pick(doneFacts));
        const details = Array.from({ length: spec.size === 'large' ? between(1, 3) : between(0, 1) }, () => fill(pick(phrases.detail)));
        const upNext = openNext.length === 0 ? '' : ` ${phrases.nextUp.replace('{x}', pick(openNext))}`;
        says('agent', `${[...new Set(told)].map((line) => `${line}.`).join(' ')}${details.map((line) => ` ${line}`).join('')}${upNext}`);
    }
    clock = NOW - (closing + 1) * MINUTE;
    const openNow = sorted.find((raw) => raw.state === 'open' && raw.section === 'now');
    const unfinished = sorted.find((raw) => raw.state === 'open' && raw.section === 'needs' && !raw.asks);
    const asked = sorted.find((raw) => raw.state === 'open' && raw.section === 'needs' && raw.asks);
    const sentence = (text: string): string => (/[.?!]$/u.test(text) ? text : `${text}.`);
    const standing = [
        openNow === undefined ? '' : phrases.stand.replace('{x}', openNow.text),
        unfinished === undefined ? '' : phrases.open.replace('{x}', unfinished.text),
        asked === undefined ? '' : sentence(phrases.waiting.replace('{x}', asked.text)),
    ].filter((line) => line !== '').join(' ');
    says('agent', standing);
    says('user', phrases.later);
    for (const turn of spec.turns ?? []) {
        clock += 30 * 1000;
        if (turn.r === 'tool') recent.push({ role: 'tool', text: textOf(turn.x), kind: turn.kind ?? 'other', ...(turn.what === undefined ? {} : { what: textOf(turn.what) }) });
        else says(turn.r, turn.x);
    }

    const input: CompactionMaterial = {
        agent: { kind: 'claude', label: spec.label ?? project.label, repo: null, branch: null },
        note: spec.note ?? null,
        current,
        history,
        lastBreakAt: breakAt,
        recent,
        clock: { now: NOW, zone: 'UTC' },
    };
    const document = compactionInput(input);

    const windowed = sorted.map((raw, index) => ({ raw, index })).filter(({ raw }) => raw.state === 'open' && COVERED.has(raw.section));
    const inWindow = windowed.slice(0, WINDOW);
    const checked = factsOf(history);
    if (checked.length !== inWindow.length || checked.some((fact, at) => fact.text !== inWindow[at]?.raw.text)) throw new Error(`${spec.id}: the window differs from the plugin's factsOf`);
    const mustKeep = inWindow.filter(({ raw }) => BLOCKING.has(raw.section));
    const goalAt = sorted.findIndex((raw) => raw.state === 'open' && raw.section === 'goal');
    const settled = sorted.map((raw, index) => ({ raw, index })).filter(({ raw }) => settledBefore(raw.closedAt, breakAt));

    const expected = {
        language: 'en',
        session_language: project.language,
        note: spec.note ?? null,
        goal: { index: goalAt, text: project.goal },
        must_keep: mustKeep.map(({ raw, index }) => ({ index, section: raw.section, text: raw.text })),
        reasons: mustKeep.filter(({ raw }) => raw.section === 'decisions' && raw.why !== null).map(({ raw, index }) => ({ index, text: raw.text, why: raw.why })),
        waiting_on_operator: mustKeep.filter(({ raw }) => raw.section === 'needs' && raw.asks).map(({ raw, index }) => ({ index, text: raw.text })),
        settled: settled.map(({ raw, index }) => ({ index, section: raw.section, text: raw.text })),
        must_not_reopen: (spec.plantedSettled ?? []).map((key) => ({ index: indexOf(key), section: sorted[indexOf(key)]?.section, text: sorted[indexOf(key)]?.text })),
        planted: {
            reasons: (spec.plantedReasons ?? []).map((key) => ({ index: indexOf(key), text: sorted[indexOf(key)]?.text, why: sorted[indexOf(key)]?.why })),
            bait: spec.bait ?? [],
            forbidden_not_in_own: spec.notInOwn ?? [],
            forbidden_in_own: spec.inOwn ?? [],
            gate_conflict: spec.gateConflict === true,
            long_ledger: spec.plants.includes('long-ledger'),
        },
        must_keep_characters: mustKeep.reduce((sum, { raw }) => sum + raw.text.length + (raw.why?.length ?? 0), 0),
        blocking_outside_window: windowed.slice(WINDOW).filter(({ raw }) => BLOCKING.has(raw.section)).length,
        allowed_tokens: tokensOf(document),
    };

    return { id: spec.id, plants: spec.plants, tags: [`size:${spec.size}`, `project:${project.name}`, `language:${project.language}`, `facts:${history.length}`, spec.note === undefined ? 'note:no' : 'note:yes', breakAt === null ? 'break:no' : 'break:yes'], input, expected };
}

const lines = ITEMS.map((spec) => JSON.stringify(buildItem(spec)));
const target = join(import.meta.dir, '..', 'dataset.jsonl');
writeFileSync(target, `${lines.join('\n')}\n`);
console.log(`${lines.length} items, ${Buffer.byteLength(lines.join('\n'))} bytes -> ${target}`);
