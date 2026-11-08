import { err, must, ok, type Result } from '#src/protocol/result.ts';
import { parseCount, type Count } from '#src/recap/domain/count.ts';
import { isFields, parseHcTerminal, seenOfHcTerminal } from '#src/recap/domain/hc-terminal.ts';
import type { HcTerminal } from '#src/recap/domain/hc-terminal.ts';
import { parsePaneId } from '#src/recap/domain/ids.ts';
import type { PaneId } from '#src/recap/domain/ids.ts';
import type { SeenLane } from '#src/recap/domain/lane.ts';
import type { ParseFailure } from '#src/recap/domain/parse-failure.ts';
import { parseNonEmptyText, type NonEmptyText } from '#src/recap/domain/text.ts';
import type { Frame } from '#src/ports/fleet-source.ts';
import { parseHcPayload } from './desktop-package.ts';
import type { HcEvent, HcPayload } from './desktop-package.ts';
import type { HcCoreFeed } from './desktop-package.ts';
import { framesBetween } from './hc-frames.ts';
import { agentOfApp } from './hc-kinds.ts';
import type { SessionOfTerminal } from './hc-sessions.ts';

export interface HcListed {
    readonly terminals: readonly HcPayload[];
}

type Seeding = 'no' | 'yes';

const FINISHED_STATE = 'finished';
const LIVE_STATE = 'live';
const ZERO = must(parseCount(0));
const ONE = must(parseCount(1));

function patchOf(type: NonEmptyText, data: HcPayload): HcPayload {
    const fields: unknown = data;
    if (!isFields(fields)) {
        return NO_PATCH;
    }
    switch (type) {
        case 'foreground':
            return must(parseHcPayload({ foreground: data }));
        case 'labels':
            return must(parseHcPayload({ labels: fields['labels'] }));
        case 'title':
            return must(parseHcPayload({ title: fields['title'] }));
        case 'status':
            return must(parseHcPayload({ status: fields['status'], reported: fields['reported'], records: fields['records'] }));
        case 'keep':
            return must(parseHcPayload({ keep: fields['keep'] }));
        case 'size':
            return must(parseHcPayload({ cols: fields['cols'], rows: fields['rows'] }));
        case 'finished':
        case 'lost':
            return must(parseHcPayload({ exit_code: fields['exit_code'], finished_ms: fields['finished_ms'], reason: fields['reason'], signal: fields['signal'], state: FINISHED_STATE, foreground: null }));
        default:
            return NO_PATCH;
    }
}

const NO_PATCH: HcPayload = must(parseHcPayload({}));

export function parseHcListed(input: unknown): Result<HcListed, ParseFailure> {
    const rows: unknown = isFields(input) ? input['terminals'] : undefined;
    if (!Array.isArray(rows)) {
        return err({ kind: 'not-a-row' });
    }
    const items: readonly unknown[] = rows;
    return ok({ terminals: items.flatMap((row): HcPayload[] => { const payload = parseHcPayload(row); return payload.kind === 'ok' ? [payload.value] : []; }) });
}

function addressOf(row: HcPayload): PaneId | null {
    const fields: unknown = row;
    const address = parsePaneId(isFields(fields) ? fields['address'] : undefined);
    return address.kind === 'ok' ? address.value : null;
}

export class HcCoreRoster {
    private rows = new Map<PaneId, HcPayload>();
    private known: readonly SeenLane[] = [];
    private seeded: Seeding = 'no';
    private folds: Count = ZERO;
    private readonly cache = new WeakMap<HcPayload, SeenLane | null>();
    private readonly sessions: SessionOfTerminal;

    constructor(sessions: SessionOfTerminal) {
        this.sessions = sessions;
    }

    load(terminals: readonly HcPayload[]): readonly SeenLane[] {
        this.replace(terminals);
        this.known = this.derive();
        this.seeded = 'yes';
        return this.known;
    }

    get revision(): Count {
        return this.folds;
    }

    fold(feed: HcCoreFeed): readonly Frame[] {
        if (feed.kind === 'heartbeat') {
            return [];
        }
        this.folds = must(parseCount(this.folds + ONE));
        if (feed.kind === 'event') {
            this.apply(feed);
        } else {
            this.replace(feed.snapshot.terminals);
        }
        const lanes = this.derive();
        const frames = this.seeded === 'yes' ? framesBetween(this.known, lanes) : [];
        this.known = lanes;
        this.seeded = 'yes';
        return frames;
    }

    lanes(): readonly SeenLane[] {
        return this.known;
    }

    panes(): readonly PaneId[] {
        return [...this.rows].flatMap(([address, row]) => {
            const fields: unknown = row;
            return isFields(fields) && fields['state'] === LIVE_STATE ? [address] : [];
        });
    }

    terminal(pane: PaneId): HcTerminal | null {
        const row = this.rows.get(pane);
        const parsed = row === undefined ? null : parseHcTerminal(row);
        return parsed !== null && parsed.kind === 'ok' ? parsed.value : null;
    }

    private replace(terminals: readonly HcPayload[]): void {
        const next = new Map<PaneId, HcPayload>();
        for (const row of terminals) {
            const address = addressOf(row);
            if (address !== null) {
                next.set(address, row);
            }
        }
        this.rows = next;
    }

    private apply(event: HcEvent): void {
        const named = parsePaneId(event.terminal);
        const key = named.kind === 'ok' ? named.value : addressOf(event.data);
        if (key === null) {
            return;
        }
        if (event.type === 'created' || event.type === 'restarted') {
            this.rows.set(key, event.data);
            return;
        }
        const row = this.rows.get(key);
        if (event.type === 'removed') {
            this.rows.delete(key);
        } else if (row !== undefined) {
            this.rows.set(key, must(parseHcPayload({ ...row, ...patchOf(must(parseNonEmptyText(event.type)), event.data) })));
        }
    }

    private derive(): readonly SeenLane[] {
        return [...this.rows.values()].flatMap((row) => {
            const lane = this.laneOf(row);
            return lane === null ? [] : [lane];
        });
    }

    private laneOf(row: HcPayload): SeenLane | null {
        const cached = this.cache.get(row);
        if (cached !== undefined) {
            return cached;
        }
        const parsed = parseHcTerminal(row);
        const agent = parsed.kind === 'ok' ? agentOfApp(parsed.value.app) : null;
        const lane = parsed.kind === 'ok' && agent !== null ? seenOfHcTerminal(parsed.value, this.sessions(parsed.value), agent) : null;
        if (lane === null || lane.session !== null) {
            this.cache.set(row, lane);
        }
        return lane;
    }
}
