import { err, ok, type Result } from '#src/protocol/result.ts';
import { parsePositiveCount, type PositiveCount } from './count.ts';
import { parseDirectory, type Directory } from './directory.ts';
import { parseNonEmptyText, parseText, type NonEmptyText, type Text } from './text.ts';
import { parseTabId, parseWorkspaceId, parsePaneId } from './ids.ts';
import type { AgentKind, PaneId, SessionId, TabId, WorkspaceId } from './ids.ts';
import type { ParseFailure } from './parse-failure.ts';
import type { SeenLane } from './lane.ts';

export interface HcTerminal {
    readonly address: PaneId;
    readonly tab: TabId;
    readonly workspace: WorkspaceId;
    readonly app: NonEmptyText;
    readonly status: NonEmptyText;
    readonly pid: PositiveCount | null;
    readonly cwd: Directory | null;
    readonly title: Text | null;
}

const TAB_LABEL = 'herdr.tab';
const WORKSPACE_LABEL = 'herdr.space';

type Fields = Readonly<Record<string, unknown>>;

export function isFields(input: unknown): input is Fields {
    return typeof input === 'object' && input !== null;
}

export type HcTerminals = readonly HcTerminal[];
export type HcAddresses = readonly PaneId[];

function orNull<T>(parsed: Result<T, ParseFailure>): T | null {
    return parsed.kind === 'ok' ? parsed.value : null;
}

export interface Placement {
    readonly tab: TabId;
    readonly workspace: WorkspaceId;
}

export interface Report {
    readonly app: NonEmptyText;
    readonly status: NonEmptyText;
}

export function parsePlacement(input: unknown): Result<Placement, ParseFailure> {
    const tab = parseTabId(isFields(input) ? input[TAB_LABEL] : undefined);
    const workspace = parseWorkspaceId(isFields(input) ? input[WORKSPACE_LABEL] : undefined);
    return tab.kind === 'ok' && workspace.kind === 'ok' ? ok({ tab: tab.value, workspace: workspace.value }) : err({ kind: 'empty' });
}

export function parseReport(input: unknown): Result<Report, ParseFailure> {
    const app = parseNonEmptyText(isFields(input) ? input['app'] : undefined);
    const status = parseNonEmptyText(isFields(input) ? input['state'] : undefined);
    return app.kind === 'ok' && status.kind === 'ok' ? ok({ app: app.value, status: status.value }) : err({ kind: 'empty' });
}

export interface Foreground {
    readonly pid: PositiveCount | null;
    readonly cwd: Directory | null;
}

export function parseForeground(input: unknown): Result<Foreground, ParseFailure> {
    if (!isFields(input)) {
        return err({ kind: 'not-a-row' });
    }
    const foreground = input['foreground'];
    return ok({
        pid: orNull(parsePositiveCount(isFields(foreground) ? foreground['pid'] : undefined)),
        cwd: orNull(parseDirectory(isFields(foreground) ? foreground['cwd'] : undefined)) ?? orNull(parseDirectory(input['cwd'])),
    });
}

export function parseHcTerminal(input: unknown): Result<HcTerminal, ParseFailure> {
    if (!isFields(input)) {
        return err({ kind: 'not-a-row' });
    }
    const address = parsePaneId(input['address']);
    const placement = parsePlacement(input['labels']);
    const report = parseReport(input['status']);
    if (input['state'] !== 'live' || address.kind === 'err' || placement.kind === 'err' || report.kind === 'err') {
        return err({ kind: 'empty' });
    }
    const foreground = parseForeground(input);
    return ok({ address: address.value, ...placement.value, ...report.value, pid: foreground.kind === 'ok' ? foreground.value.pid : null, cwd: foreground.kind === 'ok' ? foreground.value.cwd : null, title: orNull(parseText(input['title'])) });
}

export interface HcRoster {
    readonly live: HcAddresses;
    readonly agents: HcAddresses;
}

export function parseHcRoster(input: unknown): Result<HcRoster, ParseFailure> {
    const rows: unknown = isFields(input) ? input['terminals'] : undefined;
    if (!Array.isArray(rows)) {
        return err({ kind: 'not-a-row' });
    }
    const live: PaneId[] = [];
    const agents: PaneId[] = [];
    const items: readonly unknown[] = rows;
    for (const row of items) {
        const address = parsePaneId(isFields(row) ? row['address'] : undefined);
        if (isFields(row) && row['state'] === 'live' && address.kind === 'ok') {
            live.push(address.value);
            if (row['status'] !== null && row['status'] !== undefined) {
                agents.push(address.value);
            }
        }
    }
    return ok({ live, agents });
}

export function seenOfHcTerminal(terminal: HcTerminal, session: SessionId | null, agent: AgentKind): SeenLane {
    return {
        paneId: terminal.address,
        tabId: terminal.tab,
        workspaceId: terminal.workspace,
        agent,
        status: terminal.status,
        session,
        cwd: terminal.cwd,
        title: terminal.title,
    };
}
