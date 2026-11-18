import type { Done } from '#src/ports/columns.ts';
import type { CompactionRecords } from '#src/ports/compaction-records.ts';
import type { PaneTokens } from '#src/ports/pane-tokens.ts';
import type { Exchange } from '#src/protocol/exchange.ts';
import type { CompactNote } from '#src/recap/domain/compact-note.ts';
import { beginCompact, noteFromRequest, opensAskPopup, type CompactStart } from './compact-start.ts';
import { stepNote, type NoteState, type NoteStepped } from './compact-keys.ts';
import { restartAnswers } from './ask-restart.ts';
import { PaneTypingLease, type Acquired } from './typing-lease.ts';
import { LEASE_TTL_MS } from '#src/recap/domain/typing-lease.ts';
import type { AnswerTally } from '#src/ports/autocompact-records.ts';
import type { Decider, Noul } from '#src/ports/decider.ts';
import type { HistoryFact } from '#src/ports/ledger.ts';
import { must } from '#src/protocol/result.ts';
import { parseCheckedFact, type CheckedFact } from '#src/recap/domain/autocompact.ts';
import { parseCount } from '#src/recap/domain/count.ts';
import { parseProbability, type Probability } from '#src/recap/domain/probability.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';
import { checkCoverage, checkedFactsOf, correctionFor, KEPT_AT_LEAST, questionsOf, unmetLinesOf, unmetOf, type CheckedCoverage, type MissingPart, type UnmetFact } from './brief-coverage.ts';
import type { Ask, AskLedger } from '#src/ports/ask-ledger.ts';
import type { Board } from '#src/recap/domain/board.ts';
import type { Requests } from '#src/ports/requests.ts';
import type { LaneTokens } from '#src/ports/lane-tokens.ts';
import { parseWireText, type WireText } from '#src/protocol/primitives.ts';
import type { TokenMap } from '#src/protocol/tokens.ts';
import { parseAskId } from '#src/recap/domain/compact-request.ts';
import { paneId, tabId } from '#src/recap/domain/ids.ts';
import { instant, parseInstant, parseMilliseconds, type Instant, type Milliseconds } from '#src/recap/domain/time.ts';
import type { Presence } from '#src/recap/domain/presence.ts';
import { CompactRequestQueue } from './compact-requests.ts';

export interface CoverageFact {
    readonly section: string;
    readonly text: string;
    readonly why: string | null;
}

export interface MissingFact {
    readonly index: number;
    readonly fact: CoverageFact;
    readonly parts: readonly MissingPart[];
}

export interface Coverage {
    readonly ok: boolean;
    readonly missing: readonly string[];
    readonly missingFacts: readonly MissingFact[];
    readonly answers: Readonly<Record<string, number>>;
    readonly unknown: string | null;
    readonly costUsd?: number | null;
}

const probabilityOf = (raw: number): Probability => {
    const found = parseProbability(raw);
    if (found === null) throw new RangeError(`not a probability: ${raw}`);
    return found;
};

const typedFacts = (facts: readonly CoverageFact[]): CheckedFact[] => facts.flatMap((fact) => {
    const checked = parseCheckedFact(fact);
    return checked === null ? [] : [checked];
});

const typedAnswers = (answers: Readonly<Record<string, number>>): AnswerTally => new Map(Object.entries(answers).map(([key, value]) => [must(parseText(key)), probabilityOf(value)] as const));

const typedUnmet = (missing: readonly MissingFact[]): UnmetFact[] => missing.flatMap(({ index, fact, parts }) => {
    const checked = parseCheckedFact(fact);
    return checked === null ? [] : [{ index: must(parseCount(index)), fact: checked, parts }];
});

const legacyCoverage = (result: CheckedCoverage): Coverage => ({
    ok: result.complete === 'present',
    missing: result.missing,
    missingFacts: result.missingFacts,
    answers: Object.fromEntries(result.answers),
    unknown: result.unknown,
    ...(result.costUsd === undefined ? {} : { costUsd: result.costUsd }),
});

export const factsOf = (history: readonly HistoryFact[]): readonly CoverageFact[] => checkedFactsOf(history);

export const questionsFor = (facts: readonly CoverageFact[]): ReadonlyMap<Text, Noul> => questionsOf(typedFacts(facts));

export const missingOf = (answers: Readonly<Record<string, number>>, facts: readonly CoverageFact[], keptAtLeast: number = KEPT_AT_LEAST): readonly MissingFact[] =>
    unmetOf(typedAnswers(answers), typedFacts(facts), probabilityOf(keptAtLeast));

export const linesOf = (missing: readonly MissingFact[]): readonly string[] => unmetLinesOf(typedUnmet(missing));

export const correctionOf = (missing: readonly string[]): string => correctionFor(missing.map((line) => must(parseText(line))));

export const covered = (brief: string, facts: readonly CoverageFact[], decider: Decider, keptAtLeast: number = KEPT_AT_LEAST): Promise<Coverage> =>
    checkCoverage(must(parseText(brief)), typedFacts(facts), decider, probabilityOf(keptAtLeast)).then(legacyCoverage);

export interface CompactRequestDeps {
    readonly enabled: () => boolean;
    readonly board: () => Board;
    readonly requests: Pick<Requests, 'requestCompact'>;
    readonly asks: AskLedger;
    readonly tokens: LaneTokens;
    readonly now: () => number;
    readonly log: (line: string) => void;
}

const wireMap = (tokens: TokenMap): ReadonlyMap<WireText, WireText> => {
    const wire = new Map<WireText, WireText>();
    for (const [name, raw] of Object.entries(tokens)) {
        const key = parseWireText(name);
        const value = parseWireText(raw);
        if (key.kind === 'ok' && value.kind === 'ok') {
            wire.set(key.value, value.value);
        }
    }
    return wire;
};

export class CompactRequests {
    private readonly queue: CompactRequestQueue;

    constructor(deps: CompactRequestDeps) {
        this.queue = new CompactRequestQueue({
            enabled: (): Presence => (deps.enabled() ? 'present' : 'absent'),
            board: deps.board,
            requests: deps.requests,
            asks: deps.asks,
            tokens: deps.tokens,
            now: (): Instant => must(parseInstant(deps.now())),
            log: (line: Text): void => deps.log(line),
        });
    }

    onPaneTokens(pane: string, tokens: TokenMap): void {
        if (pane.trim() === '') {
            return;
        }
        this.queue.onPaneTokens(paneId(pane), wireMap(tokens));
    }

    tick(): void {
        this.queue.tick();
    }

    answer(id: string, pane: string, stage: string): void {
        const askId = parseAskId(id);
        if (askId !== null && pane.trim() !== '') {
            this.queue.answer(askId, paneId(pane), must(parseWireText(stage)));
        }
    }
}

export const optionalText = (note: string | null | undefined): Text | null | undefined => (note === null || note === undefined ? note : must(parseText(note)));

export function requestNoteOf(text: string): Text | null {
    return noteFromRequest(must(parseText(text)));
}

export const opensPopup = (note: string | null | undefined, setting: CompactNote): boolean => opensAskPopup(optionalText(note), setting) === 'present';

export function startCompact(tab: string, pane: string | null, note: string | null | undefined, setting: CompactNote, start: CompactStart): Promise<Done> {
    return beginCompact(tabId(tab), pane === null ? null : paneId(pane), optionalText(note), setting, start);
}

export function step(state: NoteState, key: string): NoteStepped {
    return stepNote(state, must(parseText(key)));
}

export interface RestartDeps {
    readonly exchanges: readonly Exchange[];
    readonly ledger: AskLedger;
    readonly requests: Pick<Requests, 'takeAnswered'>;
    readonly compactions: Pick<CompactionRecords, 'interrupted'>;
    readonly tokens: Pick<LaneTokens, 'report'>;
    readonly enabled: () => boolean;
    readonly local: (ask: Ask) => void;
    readonly handoff: (ask: Ask) => void;
    readonly withdraw: (ask: Ask) => void;
    readonly log: (line: string) => void;
    readonly now: () => number;
    readonly restartedWhy: string;
}

export function answerRestart(deps: RestartDeps): number {
    return restartAnswers({ ...deps, compactions: { interrupted: (at, why) => must(parseCount(deps.compactions.interrupted(at, why))) }, enabled: () => (deps.enabled() ? 'present' : 'absent'), now: () => instant(deps.now()), restartedWhy: must(parseText(deps.restartedWhy)) });
}

export interface TypingLeaseDeps {
    readonly tokens: LaneTokens;
    readonly panes: PaneTokens;
    readonly now: () => number;
    readonly pause: (ms: Milliseconds) => Promise<void>;
    readonly log: (line: string) => void;
}

export class TypingLease {
    private readonly lease: PaneTypingLease;

    constructor(deps: TypingLeaseDeps) {
        this.lease = new PaneTypingLease({ tokens: deps.tokens, panes: deps.panes, now: (): Instant => instant(deps.now()), pause: deps.pause, log: deps.log });
    }

    release(pane: string): Promise<void> {
        return this.lease.release(paneId(pane));
    }

    acquire(pane: string, waitMs: number = LEASE_TTL_MS): Promise<Acquired> {
        return this.lease.acquire(paneId(pane), must(parseMilliseconds(waitMs)));
    }
}
