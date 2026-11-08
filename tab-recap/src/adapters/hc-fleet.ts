import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { homedir } from 'node:os';
import { createInterface } from 'node:readline';
import { AsyncQueue } from '#src/recap/application/async-queue.ts';
import { parseHcRoster, parseHcTerminal, seenOfHcTerminal } from '#src/recap/domain/hc-terminal.ts';
import type { PaneId, SessionId, TabId } from '#src/recap/domain/ids.ts';
import type { SeenLane } from '#src/recap/domain/lane.ts';
import type { HcTerminals } from '#src/recap/domain/hc-terminal.ts';
import { parseCount } from '#src/recap/domain/count.ts';
import { must } from '#src/protocol/result.ts';
import { duration } from '#src/recap/domain/time.ts';
import type { ClosedAll, Done, LayoutResult, OpenResult } from '#src/ports/columns.ts';
import type { Fleet } from '#src/ports/fleet.ts';
import type { Frame, SnapshotResult, StreamResult } from '#src/ports/fleet-source.ts';
import type { Harnesses, HarnessesResult } from '#src/ports/harnesses.ts';
import type { Notified } from '#src/ports/notifier.ts';
import type { PaneTokensResult } from '#src/ports/pane-tokens.ts';
import type { RunResult } from '#src/ports/process-control.ts';
import type { ScreenResult } from '#src/ports/screens.ts';
import { unknown } from '#src/ports/unknowable.ts';
import type { Unknown } from '#src/ports/unknowable.ts';
import type { WorkspacesResult } from '#src/ports/workspace-tokens.ts';
import { HcAgents } from './hc-agents.ts';
import type { HcListing, HcTerminalListing } from './hc-agents.ts';
import { framesBetween } from './hc-frames.ts';
import { agentOfApp } from './hc-kinds.ts';
import type { SessionOfTerminal } from './hc-sessions.ts';
import { run } from './process.ts';
import type { Runner } from './process.ts';
import type { Count } from '#src/recap/domain/count.ts';

export const HC_TIMEOUT_MS = duration(10_000);
const NO_COLUMN = 'the desktop app has no column to open';
const NO_NOTICE = 'the desktop app posts its own notifications';

type PumpFlag = 'running' | 'again';

const ZERO = must(parseCount(0));

export type EventsSpawner = () => ChildProcess;

export const spawnHcEvents: EventsSpawner = () => spawn('hc', ['events', '--json'], { stdio: ['ignore', 'pipe', 'ignore'], env: process.env });

function failureOf(result: RunResult): Unknown {
    if (result.timedOut) {
        return unknown({ why: 'timeout', after: HC_TIMEOUT_MS });
    }
    return unknown({ why: 'failed', code: result.code, detail: `${result.stderr}${result.stdout}`.trim().slice(0, 200) });
}

export interface HcFleetParts {
    readonly runner?: Runner;
    readonly events?: EventsSpawner;
    readonly harnesses: Harnesses;
    readonly sessions: SessionOfTerminal;
}

export class HcFleet implements Fleet {
    private readonly runner: Runner;
    private readonly events: EventsSpawner;
    private readonly harnesses: Harnesses;
    private readonly sessions: SessionOfTerminal;
    private known: readonly SeenLane[] = [];
    private readonly flags = new Set<PumpFlag>();
    private screens: Count = ZERO;

    constructor(parts: HcFleetParts) {
        this.runner = parts.runner ?? run;
        this.events = parts.events ?? spawnHcEvents;
        this.harnesses = parts.harnesses;
        this.sessions = parts.sessions;
    }

    private async ls(): Promise<RunResult> {
        return this.runner('hc', ['ls', '--json'], { input: '', timeoutMs: HC_TIMEOUT_MS, cwd: homedir(), env: process.env });
    }

    private async screenOf(pane: PaneId): Promise<RunResult> {
        return this.runner('hc', ['read', String(pane)], { input: '', timeoutMs: HC_TIMEOUT_MS, cwd: homedir(), env: process.env });
    }

    private async terminalOf(address: PaneId): Promise<HcTerminals> {
        try {
            const result = await this.runner('hc', ['get', String(address), '--json'], { input: '', timeoutMs: HC_TIMEOUT_MS, cwd: homedir(), env: process.env });
            const parsed = result.code === 0 && !result.timedOut ? parseHcTerminal(JSON.parse(result.stdout)) : null;
            return parsed !== null && parsed.kind === 'ok' ? [parsed.value] : [];
        } catch {
            return [];
        }
    }

    private async listing(): Promise<HcListing> {
        let result: RunResult;
        try {
            result = await this.ls();
        } catch (error) {
            return unknown({ why: 'unreachable', detail: error instanceof Error ? error.message : 'hc did not start' });
        }
        if (result.code !== 0 || result.timedOut) {
            return failureOf(result);
        }
        let decoded: unknown;
        try {
            decoded = JSON.parse(result.stdout);
        } catch {
            return unknown({ why: 'unreadable', detail: 'hc ls printed no JSON' });
        }
        const roster = parseHcRoster(decoded);
        if (roster.kind === 'err') {
            return unknown({ why: 'unreadable', detail: 'hc ls printed an unexpected answer' });
        }
        const found = await Promise.all(roster.value.agents.map((address) => this.terminalOf(address)));
        return { kind: 'listing', terminals: found.flat(), addresses: roster.value.live };
    }

    private lanesOf(listing: HcTerminalListing): readonly SeenLane[] {
        return listing.terminals.flatMap((terminal) => {
            const agent = agentOfApp(terminal.app);
            return agent === null ? [] : [seenOfHcTerminal(terminal, this.sessions(terminal), agent)];
        });
    }

    async sessionOf(pane: PaneId): Promise<SessionId | null | Unknown> {
        const listing = await this.listing();
        if (listing.kind !== 'listing') {
            return listing;
        }
        const terminal = listing.terminals.find((candidate) => candidate.address === pane);
        return terminal === undefined ? null : this.sessions(terminal);
    }

    async snapshot(): Promise<SnapshotResult> {
        const listing = await this.listing();
        if (listing.kind !== 'listing') {
            return listing;
        }
        const lanes = this.lanesOf(listing);
        this.known = lanes;
        return { kind: 'snapshot', seen: { focusedTab: null, lanes, panes: listing.addresses, columns: [], widths: new Map() }, focusedTab: null, paneTokens: new Map() };
    }

    private async pump(queue: AsyncQueue<Frame>): Promise<void> {
        if (this.flags.has('running')) {
            this.flags.add('again');
            return;
        }
        this.flags.add('running');
        let more = true;
        while (more) {
            this.flags.delete('again');
            const listing = await this.listing();
            if (listing.kind === 'listing') {
                const lanes = this.lanesOf(listing);
                for (const frame of framesBetween(this.known, lanes)) {
                    queue.push(frame);
                }
                this.known = lanes;
            }
            more = this.flags.has('again');
        }
        this.flags.delete('running');
    }

    async subscribe(): Promise<StreamResult> {
        const queue = new AsyncQueue<Frame>();
        let child: ChildProcess;
        try {
            child = this.events();
        } catch (error) {
            return unknown({ why: 'unreachable', detail: error instanceof Error ? error.message : 'hc did not start' });
        }
        const input = child.stdout;
        if (input === null) {
            return unknown({ why: 'unreachable', detail: 'hc events has no output' });
        }
        let first = true;
        createInterface({ input, crlfDelay: Infinity }).on('line', () => {
            if (first) {
                first = false;
                return;
            }
            void this.pump(queue);
        });
        child.on('error', () => { queue.end(); });
        child.on('close', () => { queue.end(); });
        return { kind: 'stream', stream: { frames: (): AsyncIterable<Frame> => queue, close: (): void => { child.kill(); queue.end(); } } };
    }

    layout(tab: TabId): Promise<LayoutResult> {
        return Promise.resolve(unknown({ why: 'not-found', what: `the layout of ${tab}` }));
    }

    open(): Promise<OpenResult> {
        return Promise.resolve(unknown({ why: 'unreachable', detail: NO_COLUMN }));
    }

    resize(): Promise<Done> {
        return Promise.resolve({ kind: 'done' });
    }

    close(): Promise<Done> {
        return Promise.resolve({ kind: 'done' });
    }

    closeEvery(): Promise<ClosedAll> {
        return Promise.resolve({ kind: 'closed', closed: 0, failed: 0 });
    }

    available(): Promise<HarnessesResult> {
        return this.harnesses.available();
    }

    async readScreen(pane: PaneId, lines: Count): Promise<ScreenResult> {
        let result: RunResult;
        try {
            result = await this.screenOf(pane);
        } catch (error) {
            return unknown({ why: 'unreachable', detail: error instanceof Error ? error.message : 'hc did not start' });
        }
        if (result.code !== 0 || result.timedOut) {
            return failureOf(result);
        }
        const all = result.stdout.split('\n');
        this.screens = must(parseCount(this.screens + 1));
        return { kind: 'screen', text: all.slice(Math.max(0, all.length - lines)).join('\n'), revision: this.screens, truncated: all.length > lines };
    }

    report(): Promise<Done> {
        return Promise.resolve({ kind: 'done' });
    }

    read(): Promise<PaneTokensResult> {
        return Promise.resolve({ kind: 'tokens', tokens: {} });
    }

    reportWorkspace(): Promise<Done> {
        return Promise.resolve({ kind: 'done' });
    }

    workspaces(): Promise<WorkspacesResult> {
        return Promise.resolve({ kind: 'workspaces', ids: [...new Set(this.known.map((lane) => lane.workspaceId))] });
    }

    notify(): Promise<Notified> {
        return Promise.resolve(unknown({ why: 'unreachable', detail: NO_NOTICE }));
    }

    agents(): HcAgents {
        return new HcAgents(() => this.listing());
    }
}

