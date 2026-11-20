import type { Database } from 'bun:sqlite';
import type { LaneCursor } from '#src/ports/recap-records.ts';
import { must } from '#src/protocol/result.ts';
import { parsePaneId, parseTabId } from '#src/recap/domain/ids.ts';
import { parseInstant } from '#src/recap/domain/time.ts';
import { TranscriptStore, type TranscriptMove } from '../transcripts.ts';

export interface Moved {
    readonly id: Uint8Array;
    readonly pane: string;
    readonly from: number;
    readonly to: number;
    readonly replaces: Uint8Array | null;
}

const movedOf = (move: TranscriptMove): Moved => ({ id: move.id, pane: move.pane, from: move.from, to: move.to, replaces: move.replaces });

export class TranscriptRows {
    private readonly store: TranscriptStore;

    constructor(db: Database) {
        this.store = new TranscriptStore(db);
    }

    attach(tab: string, lanes: readonly LaneCursor[], at: number): readonly Moved[] {
        return this.store.attach(must(parseTabId(tab)), lanes, must(parseInstant(at))).map(movedOf);
    }

    ofPane(tab: string, pane: string, at: number): Uint8Array {
        return this.store.ofPane(must(parseTabId(tab)), must(parsePaneId(pane)), must(parseInstant(at)));
    }
}
