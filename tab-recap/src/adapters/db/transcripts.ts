import type { Database } from 'bun:sqlite';
import { and, desc, eq, ne, sql } from 'drizzle-orm';
import type { LaneCursor } from '#src/ports/recap-records.ts';
import { paneId, tabId } from '#src/recap/domain/ids.ts';
import { transcript } from './drizzle/index.ts';
import { ormOf, type Orm } from './orm.ts';
import { BadRow } from './rows.ts';
import { ids } from './uuid7.ts';

const PLACEHOLDER_AGENT = 'unknown';
const NO_SOURCE = '';
const NO_ROW = 'transcript write returned no row';

export interface Moved {
    readonly id: Uint8Array;
    readonly pane: string;
    readonly from: number;
    readonly to: number;
    readonly replaces: Uint8Array | null;
}

function plainId(bytes: Uint8Array): Uint8Array {
    return new Uint8Array(bytes);
}

interface IdRow {
    readonly id: Uint8Array;
}

function idOf(row: IdRow | undefined): Uint8Array {
    if (row === undefined) {
        throw new BadRow(NO_ROW);
    }
    return plainId(row.id);
}

export class TranscriptRows {
    private readonly orm: Orm;

    constructor(db: Database) {
        this.orm = ormOf(db);
    }

    attach(tab: string, lanes: readonly LaneCursor[], at: number): readonly Moved[] {
        const tabKey = tabId(tab);
        this.orm.update(transcript).set({ attached: 0 }).where(eq(transcript.tabId, tabKey)).run();
        return lanes.map((lane, position) => {
            const pane = paneId(lane.pane);
            const was = this.orm.select({ cursor: transcript.cursor }).from(transcript)
                .where(and(eq(transcript.tabId, tabKey), eq(transcript.pane, pane), eq(transcript.source, lane.transcript))).get() ?? null;
            const prior = was === null && lane.transcript !== NO_SOURCE
                ? this.orm.select({ id: transcript.id }).from(transcript)
                    .where(and(eq(transcript.tabId, tabKey), eq(transcript.pane, pane), ne(transcript.source, NO_SOURCE)))
                    .orderBy(desc(transcript.firstSeen), desc(transcript.id)).limit(1).get() ?? null
                : null;
            const saved = this.orm.insert(transcript)
                .values({ id: ids.next(), tabId: tabKey, pane, agent: lane.agent, source: lane.transcript, attached: 1, position, cursor: lane.cursor, tail: lane.tail, title: lane.title, lastPrompt: lane.lastPrompt, claudeNote: lane.claudeRecap, firstSeen: at })
                .onConflictDoUpdate({
                    target: [transcript.tabId, transcript.pane, transcript.source],
                    set: {
                        agent: sql`excluded.agent`,
                        attached: 1,
                        position: sql`excluded.position`,
                        cursor: sql`excluded.cursor`,
                        tail: sql`excluded.tail`,
                        title: sql`excluded.title`,
                        lastPrompt: sql`excluded.last_prompt`,
                        claudeNote: sql`excluded.claude_note`,
                    },
                })
                .returning({ id: transcript.id }).get();
            return { id: idOf(saved), pane: lane.pane, from: was === null ? lane.cursor : was.cursor, to: lane.cursor, replaces: prior === null ? null : plainId(prior.id) };
        });
    }

    ofPane(tab: string, pane: string, at: number): Uint8Array {
        const tabKey = tabId(tab);
        const paneKey = paneId(pane);
        const found = this.orm.select({ id: transcript.id }).from(transcript)
            .where(and(eq(transcript.tabId, tabKey), eq(transcript.pane, paneKey)))
            .orderBy(desc(transcript.attached), desc(transcript.id)).limit(1).get();
        if (found !== undefined) {
            return plainId(found.id);
        }
        return idOf(this.orm.insert(transcript)
            .values({ id: ids.next(), tabId: tabKey, pane: paneKey, agent: PLACEHOLDER_AGENT, source: NO_SOURCE, attached: 0, position: 0, cursor: 0, firstSeen: at })
            .returning({ id: transcript.id }).get());
    }
}
