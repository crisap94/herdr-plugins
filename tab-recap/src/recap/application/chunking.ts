// A run's new turns cut into chunks for the enumeration: at most CHUNK_CHARS of markup each, split between turns, and inside a turn only
// between bursts of tool calls. Pure; the markup is what the enumerate document shows.
import type { Entry } from '#src/ports/transcripts.ts';
import { clipHead, clipTurn } from './writer-clip.ts';
import { localTime } from './local-time.ts';
import { element, leaf } from './xml.ts';

export const CHUNK_CHARS = 6_000;
/** Calls listed per burst: a longer run of calls is several bursts, so a split can fall inside it. */
const CALLS_PER_BURST = 8;
const CALL_CHARS = 400;
const INDENT = '  ';

export interface TurnClock {
    readonly now: number;
    readonly zone: string;
}

/** The part of a run's turns that one enumeration call reads: its markup, and the entries the markup was made from. */
export interface TurnChunk {
    readonly markup: string;
    readonly entries: readonly Entry[];
}

interface Piece {
    readonly markup: string;
    readonly entries: readonly Entry[];
    /** a prompt of the operator: where a turn starts */
    readonly opens: boolean;
}

function callOf(call: Entry): string {
    const kept = clipHead(call.text, CALL_CHARS);
    const attrs = { kind: call.kind ?? 'other', what: call.what };
    return kept.text === '' ? element('call', attrs) : leaf('call', attrs, kept.text);
}

function burstOf(tools: readonly Entry[]): Piece {
    const calls = tools.filter((entry) => entry.kind !== 'read');
    const reads = tools.length - calls.length;
    return { markup: element('tools', { reads: reads === 0 ? null : reads }, calls.map(callOf).join('')), entries: tools, opens: false };
}

function turnOf(entry: Entry, clock: TurnClock): Piece {
    const role = entry.role === 'user' ? 'user' : 'agent';
    const kept = clipTurn(role, entry.text);
    const attrs = { role, at: entry.at === undefined ? null : localTime(entry.at, clock.now, clock.zone), queued: entry.queued === true ? 'yes' : null, clipped: kept.clipped ? 'middle' : null };
    return { markup: leaf('turn', attrs, kept.text), entries: [entry], opens: role === 'user' && entry.queued !== true };
}

/** The entries as pieces: a turn each, and bursts of at most CALLS_PER_BURST calls between them. */
function piecesOf(entries: readonly Entry[], clock: TurnClock): readonly Piece[] {
    const pieces: Piece[] = [];
    let tools: Entry[] = [];
    const flush = (): void => {
        if (tools.length > 0) {
            pieces.push(burstOf(tools));
            tools = [];
        }
    };
    for (const entry of entries) {
        if (entry.role !== 'tool') {
            flush();
            pieces.push(turnOf(entry, clock));
            continue;
        }
        tools.push(entry);
        if (tools.filter((each) => each.kind !== 'read').length >= CALLS_PER_BURST) {
            flush();
        }
    }
    flush();
    return pieces;
}

const sizeOf = (pieces: readonly Piece[]): number => pieces.reduce((all, piece) => all + piece.markup.length + INDENT.length + 1, 0);

/** Where a full chunk is cut: before the last prompt of the operator in it when there is one past its start, else after its last piece. */
const cutOf = (full: readonly Piece[]): number => {
    const turn = full.findLastIndex((piece, at) => at > 0 && piece.opens);
    return turn > 0 ? turn : full.length;
};

const chunkOf = (pieces: readonly Piece[]): TurnChunk => ({ markup: pieces.map((piece) => `\n${INDENT}${piece.markup}`).join('') + '\n', entries: pieces.flatMap((piece) => piece.entries) });

/** The chunks of `entries`, oldest first; none when there are none. */
export function chunksOf(entries: readonly Entry[], clock: TurnClock, limit = CHUNK_CHARS): readonly TurnChunk[] {
    const chunks: TurnChunk[] = [];
    let open: Piece[] = [];
    for (const piece of piecesOf(entries, clock)) {
        while (open.length > 0 && sizeOf(open) + sizeOf([piece]) > limit) {
            const cut = cutOf(open);
            chunks.push(chunkOf(open.slice(0, cut)));
            open = open.slice(cut);
        }
        open.push(piece);
    }
    return open.length === 0 ? chunks : [...chunks, chunkOf(open)];
}

/** The newest pieces of `entries` that fit `limit`, as one chunk (null when there are no entries): whole pieces only, the newest always. */
export function newestOf(entries: readonly Entry[], clock: TurnClock, limit: number): TurnChunk | null {
    const pieces = piecesOf(entries, clock);
    let from = pieces.length;
    while (from > 0 && sizeOf(pieces.slice(from - 1)) <= limit) {
        from -= 1;
    }
    const kept = pieces.slice(Math.min(from, pieces.length - 1));
    return kept.length === 0 ? null : chunkOf(kept);
}
