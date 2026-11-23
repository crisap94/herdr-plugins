import type { FollowingEntry, Hindsight } from '#src/experiment/hindsight.ts';
import type { LabelledMoment } from '#src/experiment/kappa-report.ts';
import type { Label } from '#src/experiment/stats.ts';
import type { HistoryFact } from '#src/ports/ledger.ts';
import type { CallKind, Entry } from '#src/ports/transcripts.ts';
import type { Result } from '#src/protocol/result.ts';
import type { AutocompactState, OpenWorkItem, Turn } from '#src/recap/application/autocompact-state.ts';
import { SKIP_GATES, type Gate } from '#src/recap/domain/autocompact.ts';
import { parseCount } from '#src/recap/domain/count.ts';
import { isClosedWhy, isSection } from '#src/recap/domain/fact.ts';
import type { ParseFailure } from '#src/recap/domain/parse-failure.ts';
import { parseText, textOf, type Text } from '#src/recap/domain/text.ts';
import { parseInstant } from '#src/recap/domain/time.ts';

import { parseRow, parseRows, type Row } from '../transcripts/jsonl.ts';
import type { Point as PointShape } from './point.ts';

export type Point = PointShape;
export type LabelledRecord = LabelledMoment;

const GATES: readonly Gate[] = [...SKIP_GATES, 'ceiling', 'ask'];
const ROLES: readonly Entry['role'][] = ['user', 'agent', 'tool'];
const KINDS: readonly CallKind[] = ['shell', 'edit', 'web', 'agent', 'other', 'read'];
const STATES: readonly HistoryFact['state'][] = ['open', 'closed'];
const LABELS: readonly Label[] = [0, 1];

const refuse = (): never => {
    throw new TypeError('a stored experiment row does not have the shape its writer gives it');
};

const taken = <T>(result: Result<T, ParseFailure>): T => (result.kind === 'ok' ? result.value : refuse());

const roleOf = (row: Row): Entry['role'] => ROLES.find((role) => role === row.role) ?? refuse();
const kindOf = (row: Row): CallKind => KINDS.find((kind) => kind === row.kind) ?? refuse();

const closedWhyOf = (row: Row): HistoryFact['closedWhy'] => {
    if (row.closedWhy === null) return null;
    return isClosedWhy(row.closedWhy) ? row.closedWhy : refuse();
};

const queuedOf = (row: Row): Pick<Entry, 'queued'> => {
    if (row.queued === undefined) return {};
    return typeof row.queued === 'boolean' ? { queued: row.queued } : refuse();
};

const entryOf = (row: Row): Entry => ({
    role: roleOf(row),
    text: taken(parseText(row.text)),
    ...(row.at === undefined ? {} : { at: taken(parseInstant(row.at)) }),
    ...queuedOf(row),
    ...(row.kind === undefined ? {} : { kind: kindOf(row) }),
    ...(row.what === undefined ? {} : { what: taken(parseText(row.what)) }),
});

const factOf = (row: Row): HistoryFact => ({
    section: isSection(row.section) ? row.section : refuse(),
    text: taken(parseText(row.text)),
    why: row.why === null ? null : taken(parseText(row.why)),
    state: STATES.find((state) => state === row.state) ?? refuse(),
    closedWhy: closedWhyOf(row),
    closedAt: row.closedAt === null ? null : taken(parseInstant(row.closedAt)),
    firstAt: taken(parseInstant(row.firstAt)),
    lastAt: taken(parseInstant(row.lastAt)),
});

const turnOf = (row: Row): Turn => ({ role: roleOf(row), text: taken(parseText(row.text)) });
const workOf = (row: Row): OpenWorkItem => ({ section: taken(parseText(row.section)), text: taken(parseText(row.text)) });

const stateOf = (row: Row): AutocompactState => ({
    last_prompt: row.last_prompt === null ? null : taken(parseText(row.last_prompt)),
    last_reply: row.last_reply === null ? null : taken(parseText(row.last_reply)),
    recent_turns: taken(parseRows(row.recent_turns)).map(turnOf),
    goal: row.goal === null ? null : taken(parseText(row.goal)),
    open_work: taken(parseRows(row.open_work)).map(workOf),
});

const followingOf = (row: Row): FollowingEntry => ({
    role: roleOf(row),
    ...(row.kind === undefined ? {} : { kind: kindOf(row) }),
    text: taken(parseText(row.text)),
});

const hindsightOf = (row: Row): Hindsight => ({
    next_prompt: row.next_prompt === null ? null : taken(parseText(row.next_prompt)),
    following: taken(parseRows(row.following)).map(followingOf),
});

const pointFrom = (row: Row): Point => ({
    id: taken(parseText(row.id)),
    tab: taken(parseText(row.tab)),
    pane: taken(parseText(row.pane)),
    at: taken(parseInstant(row.at)),
    source: taken(parseText(row.source)),
    cursor: taken(parseCount(row.cursor)),
    transcript: taken(parseText(row.transcript)),
    stratum: taken(parseText(row.stratum)),
    share: row.share === null ? null : taken(parseCount(row.share)),
    tokens: row.tokens === null ? null : taken(parseCount(row.tokens)),
    window: row.window === null ? null : taken(parseCount(row.window)),
    inFlight: row.inFlight === 'unknown' ? 'unknown' : taken(parseCount(row.inFlight)),
    lastBreakAt: row.lastBreakAt === null ? null : taken(parseInstant(row.lastBreakAt)),
    gate: GATES.find((gate) => gate === row.gate) ?? refuse(),
    state: stateOf(taken(parseRow(row.state))),
    recent: taken(parseRows(row.recent)).map(entryOf),
    history: taken(parseRows(row.history)).map(factOf),
    hindsight: hindsightOf(taken(parseRow(row.hindsight))),
});

export const parsePoint = (value: unknown): Point => pointFrom(taken(parseRow(value)));

export const parseLabelledRecord = (value: unknown): LabelledRecord => {
    const row = taken(parseRow(value));
    const labels = taken(parseRow(row.labels));
    return {
        id: taken(parseText(row.id)),
        labels: new Map(Object.entries(labels).map(([name, label]): [Text, Label] => [textOf(name), LABELS.find((known) => known === label) ?? refuse()])),
    };
};
