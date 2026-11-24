import type { SessionCursor } from '#src/ports/recap-records.ts';
import { textOf } from '#src/recap/domain/text.ts';
import { cursorOf, sourcePathOf, UNREAD, type Position, type SessionReader } from '#src/ports/transcripts.ts';
import type { SessionId } from '#src/contract/ids.ts';

const REMEMBERED = 512;

const positionOf = (seat: SessionCursor): Position => ({ cursor: cursorOf(seat.cursor), tail: seat.tail === null ? null : textOf(seat.tail) });

export interface CarryAsk {
    readonly session: SessionId | null;
    readonly cursors: readonly SessionCursor[];
    readonly wanted: SessionCursor;
    readonly reader: SessionReader;
}

export class CursorCarry {
    private readonly seen = new Map<string, SessionCursor>();

    async cursorFor(ask: CarryAsk): Promise<SessionCursor> {
        const { session, cursors, wanted, reader } = ask;
        const exact = cursors.find((c) => c.transcript === wanted.transcript && c.agent === wanted.agent);
        if (session === null) return exact ?? wanted;
        const before = this.remember(session, wanted);
        const old = before?.agent === wanted.agent ? cursors.find((c) => c.transcript === before.transcript && c.transcript !== wanted.transcript) : undefined;
        if (exact !== undefined || old === undefined || reader.carry === undefined) return exact ?? wanted;
        const at = await reader.carry({ kind: 'located', source: sourcePathOf(old.transcript) }, { kind: 'located', source: sourcePathOf(wanted.transcript) }, positionOf(old));
        return at.cursor === UNREAD.cursor ? wanted : { ...old, ...at, transcript: wanted.transcript };
    }

    private remember(session: SessionId, wanted: SessionCursor): SessionCursor | undefined {
        const key = `${wanted.key}\n${session}`;
        const before = this.seen.get(key);
        this.seen.delete(key);
        this.seen.set(key, wanted);
        const oldest = this.seen.keys().next();
        if (this.seen.size > REMEMBERED && oldest.done !== true) this.seen.delete(oldest.value);
        return before;
    }
}
