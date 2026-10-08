// One point of EXP-002: a stored turn end of a lane, rebuilt from the transcript bytes before its cursor and the ledger at its time.
import type { HistoryFact } from '#src/ports/ledger.ts';
import type { ModelCatalogue } from '#src/ports/model-catalogue.ts';
import type { Entry } from '#src/ports/transcripts.ts';
import { autocompactState } from '#src/recap/application/autocompact-state.ts';
import type { AutocompactState } from '#src/recap/application/autocompact-state.ts';
import { contextOf, shareOf } from '#src/recap/domain/compaction.ts';
import { COOLDOWN_DEFAULT_MS, CEILING_DEFAULT, KINDS_DEFAULT, SOFT_DEFAULT, gateOf } from '#src/recap/domain/autocompact.ts';
import type { Gate } from '#src/recap/domain/autocompact.ts';
import { hindsightOf } from '#src/experiment/hindsight.ts';
import type { Hindsight } from '#src/experiment/hindsight.ts';
import { extractClaude } from './claude-rows.ts';
import { claudeInFlight } from './claude-in-flight.ts';
import { claudeObserved } from './context-rows.ts';
import { linesAfter, linesBefore } from './transcript-slice.ts';
import type { ExperimentStore, StoredPoint } from './experiment-store.ts';

/** The tail of a transcript every live reader looks through. */
const TAIL_BYTES = 256 * 1024;
/** Characters of recent entries kept in a point (the brief job clips them again to its own budget). */
const RECENT_KEPT = 60_000;

export interface Point extends StoredPoint {
    readonly stratum: string;
    readonly share: number | null;
    readonly tokens: number | null;
    readonly window: number | null;
    readonly inFlight: number | 'unknown';
    readonly lastBreakAt: number | null;
    readonly gate: Gate;
    readonly state: AutocompactState;
    readonly recent: readonly Entry[];
    readonly history: readonly HistoryFact[];
    readonly hindsight: Hindsight;
}

/** The newest entries whose texts fit `RECENT_KEPT` characters together. */
function trimmed(entries: readonly Entry[]): readonly Entry[] {
    let room = RECENT_KEPT;
    const kept: Entry[] = [];
    for (const entry of entries.toReversed()) {
        room -= entry.text.length;
        if (room < 0 && kept.length > 0) break;
        kept.push(entry);
    }
    return kept.toReversed();
}

/** The share of the window in percent from the tail of the transcript, as the live context reader would see it. */
export function shareAt(source: string, cursor: number, catalogue: ModelCatalogue): { readonly tokens: number; readonly window: number; readonly share: number } | null {
    const observed = claudeObserved(linesBefore(source, cursor, TAIL_BYTES));
    const use = observed === null ? null : contextOf({ observed, agent: 'claude', setting: null, catalogued: observed.model === null ? null : catalogue.windowOf(observed.model) });
    return use === null ? null : { tokens: use.tokens, window: use.window, share: shareOf(use) };
}

/** The gate this point would get, with the live defaults: in flight from the scanner over the same lines. */
function gateAt(stored: StoredPoint, lines: readonly string[], lastBreakAt: number | null, share: number): { readonly inFlight: number | 'unknown'; readonly gate: Gate } {
    const flight = claudeInFlight(lines);
    const inFlight = flight.kind === 'in-flight' ? flight.count : 'unknown';
    const gate = gateOf({ kind: 'claude', kinds: KINDS_DEFAULT, busy: false, inFlight, share, soft: SOFT_DEFAULT, ceiling: CEILING_DEFAULT, now: stored.at, lastBreakAt, lastDecisionAt: null, cooldownMs: COOLDOWN_DEFAULT_MS }).gate;
    return { inFlight, gate };
}

/** A point, or null when its transcript cannot be read. */
export function pointOf(store: ExperimentStore, catalogue: ModelCatalogue, stored: StoredPoint & { readonly blob: Uint8Array }, stratum: string): Point | null {
    try {
        const lines = linesBefore(stored.source, stored.cursor, TAIL_BYTES);
        const recent = trimmed(extractClaude(lines).entries);
        const history = store.factsAt(stored);
        const used = shareAt(stored.source, stored.cursor, catalogue);
        const lastBreakAt = store.lastBreakAt(stored.tab, stored.at);
        const after = extractClaude(linesAfter(stored.source, stored.cursor, TAIL_BYTES)).entries;
        const { blob: _blob, ...plain } = stored;
        return {
            ...plain, stratum, share: used?.share ?? null, tokens: used?.tokens ?? null, window: used?.window ?? null, lastBreakAt, ...gateAt(stored, lines, lastBreakAt, used?.share ?? 0),
            state: autocompactState(recent, history), recent, history, hindsight: hindsightOf(after),
        };
    } catch {
        return null;
    }
}
