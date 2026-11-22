import type { Count } from '#src/contract/kernel.ts';
import type { Entry } from '#src/ports/transcripts.ts';
import { brand, type Brand } from '#src/recap/domain/brand.ts';
import type { Text } from '#src/recap/domain/text.ts';
import { instant, type Instant } from '#src/recap/domain/time.ts';
import { clipHead, clipTurn } from './writer-clip.ts';
import { localTime } from './local-time.ts';
import { element, leaf, type Attributes } from './xml.ts';

const count = brand<number, 'Count'>;
const textOf = brand<string, 'Text'>;

export const CHUNK_CHARS = count(6_000);
const CALLS_PER_BURST = 8;
const CALL_CHARS = count(400);
const INDENT = '  ';

type OpensTurn = Brand<boolean, 'OpensTurn'>;

export interface TurnClock {
    readonly now: Instant;
    readonly zone: Text;
}

export interface TurnChunk {
    readonly markup: Text;
    readonly entries: readonly Entry[];
}

interface Piece {
    readonly markup: Text;
    readonly entries: readonly Entry[];
    readonly opens: OpensTurn;
}

function callOf(call: Entry): Text {
    const kept = clipHead(textOf(call.text), CALL_CHARS);
    const attrs: Attributes = { kind: call.kind ?? 'other', what: call.what === undefined ? undefined : textOf(call.what) };
    return textOf(kept.text === '' ? element('call', attrs) : leaf('call', attrs, kept.text));
}

function burstOf(tools: readonly Entry[]): Piece {
    const calls = tools.filter((entry) => entry.kind !== 'read');
    const reads = tools.length - calls.length;
    return { markup: textOf(element('tools', { reads: reads === 0 ? null : count(reads) }, textOf(calls.map(callOf).join('')))), entries: tools, opens: brand<boolean, 'OpensTurn'>(false) };
}

function turnOf(entry: Entry, clock: TurnClock): Piece {
    const role = entry.role === 'user' ? 'user' : 'agent';
    const kept = clipTurn(role, textOf(entry.text));
    const attrs: Attributes = { role, at: entry.at === undefined ? null : localTime(instant(entry.at), clock.now, clock.zone), queued: entry.queued === true ? 'yes' : null, clipped: kept.clipped ? 'middle' : null };
    return { markup: textOf(leaf('turn', attrs, kept.text)), entries: [entry], opens: brand<boolean, 'OpensTurn'>(role === 'user' && entry.queued !== true) };
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

const sizeOf = (pieces: readonly Piece[]): Count => count(pieces.reduce((all, piece) => all + piece.markup.length + INDENT.length + 1, 0));

const cutOf = (full: readonly Piece[]): Count => {
    const turn = full.findLastIndex((piece, at) => at > 0 && piece.opens);
    return count(turn > 0 ? turn : full.length);
};

const chunkOf = (pieces: readonly Piece[]): TurnChunk => ({ markup: textOf(pieces.map((piece) => `\n${INDENT}${piece.markup}`).join('') + '\n'), entries: pieces.flatMap((piece) => piece.entries) });

export function chunksOf(entries: readonly Entry[], clock: TurnClock, limit: Count = CHUNK_CHARS): readonly TurnChunk[] {
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

export function newestOf(entries: readonly Entry[], clock: TurnClock, limit: Count): TurnChunk | null {
    const pieces = piecesOf(entries, clock);
    let from = pieces.length;
    while (from > 0 && sizeOf(pieces.slice(from - 1)) <= limit) {
        from -= 1;
    }
    const kept = pieces.slice(Math.min(from, pieces.length - 1));
    return kept.length === 0 ? null : chunkOf(kept);
}
