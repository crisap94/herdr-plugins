import type { Entry } from '#src/ports/transcripts.ts';
import { clipHead, clipTurn } from './writer-clip.ts';
import { localTime } from './local-time.ts';
import { element, leaf } from './xml.ts';

export const CHUNK_CHARS = 6_000;
const CALLS_PER_BURST = 8;
const CALL_CHARS = 400;
const INDENT = '  ';

export interface TurnClock {
    readonly now: number;
    readonly zone: string;
}

export interface TurnChunk {
    readonly markup: string;
    readonly entries: readonly Entry[];
}

interface Piece {
    readonly markup: string;
    readonly entries: readonly Entry[];
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

const cutOf = (full: readonly Piece[]): number => {
    const turn = full.findLastIndex((piece, at) => at > 0 && piece.opens);
    return turn > 0 ? turn : full.length;
};

const chunkOf = (pieces: readonly Piece[]): TurnChunk => ({ markup: pieces.map((piece) => `\n${INDENT}${piece.markup}`).join('') + '\n', entries: pieces.flatMap((piece) => piece.entries) });

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

export function newestOf(entries: readonly Entry[], clock: TurnClock, limit: number): TurnChunk | null {
    const pieces = piecesOf(entries, clock);
    let from = pieces.length;
    while (from > 0 && sizeOf(pieces.slice(from - 1)) <= limit) {
        from -= 1;
    }
    const kept = pieces.slice(Math.min(from, pieces.length - 1));
    return kept.length === 0 ? null : chunkOf(kept);
}
