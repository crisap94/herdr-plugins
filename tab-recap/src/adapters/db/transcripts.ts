import type { Database } from 'bun:sqlite';
import { and, desc, eq, ne, sql } from 'drizzle-orm';
import { must } from '#src/protocol/result.ts';
import type { SessionCursor } from '#src/ports/recap-records.ts';
import { parseCount, type Count } from '#src/recap/domain/count.ts';
import { parsePaneId, type PaneId, type TabId } from '#src/recap/domain/ids.ts';
import type { Instant } from '#src/recap/domain/time.ts';
import { transcript } from './drizzle/index.ts';
import { ormOf, type Orm } from './orm.ts';
import { BadRow } from './rows.ts';
import { ids } from './uuid7.ts';

const PLACEHOLDER_AGENT = 'unknown';
const NO_SOURCE = '';
const NO_ROW = 'transcript write returned no row';

export interface TranscriptMove {
    readonly id: Uint8Array;
    readonly pane: PaneId;
    readonly from: Count;
    readonly to: Count;
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

export class TranscriptStore {
    private readonly orm: Orm;

    constructor(db: Database) {
        this.orm = ormOf(db);
    }

    attach(tab: TabId, lanes: readonly SessionCursor[], at: Instant): readonly TranscriptMove[] {
        this.orm.update(transcript).set({ attached: 0 }).where(eq(transcript.tabId, tab)).run();
        return lanes.map((lane, position) => {
            const pane = must(parsePaneId(lane.pane));
            const cursor = must(parseCount(lane.cursor));
            const was = this.orm.select({ cursor: transcript.cursor }).from(transcript)
                .where(and(eq(transcript.tabId, tab), eq(transcript.pane, pane), eq(transcript.source, lane.transcript))).get() ?? null;
            const prior = was === null && lane.transcript !== NO_SOURCE
                ? this.orm.select({ id: transcript.id }).from(transcript)
                    .where(and(eq(transcript.tabId, tab), eq(transcript.pane, pane), ne(transcript.source, NO_SOURCE)))
                    .orderBy(desc(transcript.firstSeen), desc(transcript.id)).limit(1).get() ?? null
                : null;
            const saved = this.orm.insert(transcript)
                .values({ id: ids.next(), tabId: tab, pane, agent: lane.agent, source: lane.transcript, attached: 1, position, cursor, tail: lane.tail, title: lane.title, lastPrompt: lane.lastPrompt, claudeNote: lane.claudeRecap, firstSeen: at })
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
            return { id: idOf(saved), pane, from: was === null ? cursor : must(parseCount(was.cursor)), to: cursor, replaces: prior === null ? null : plainId(prior.id) };
        });
    }

    ofPane(tab: TabId, pane: PaneId, at: Instant): Uint8Array {
        const found = this.orm.select({ id: transcript.id }).from(transcript)
            .where(and(eq(transcript.tabId, tab), eq(transcript.pane, pane)))
            .orderBy(desc(transcript.attached), desc(transcript.id)).limit(1).get();
        if (found !== undefined) {
            return plainId(found.id);
        }
        return idOf(this.orm.insert(transcript)
            .values({ id: ids.next(), tabId: tab, pane, agent: PLACEHOLDER_AGENT, source: NO_SOURCE, attached: 0, position: 0, cursor: 0, firstSeen: at })
            .returning({ id: transcript.id }).get());
    }
}
