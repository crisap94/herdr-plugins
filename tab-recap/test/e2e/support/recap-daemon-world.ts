import { Database } from 'bun:sqlite';
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Method, PROTOCOL } from '@stateforge-labs/herdr-sdk';
import { screenOf, type Screen } from './view-world.ts';
import { daemonWorld, type DaemonWorld, type Waiting } from './daemon-world.ts';
import { scriptedModel, type ScriptedModel } from './scripted-model-world.ts';

export const TAB = 'w1:t1';
export const PANE = 'w1:p1';
export const SESSION = '00000000-0000-4000-8000-0000000000a1';

const TURNS = readFileSync(join(import.meta.dirname, '..', '..', 'fixtures', 'replay-claude.jsonl'), 'utf8').split('\n').filter((line) => line !== '');
const EVERY = 25;
const WITHIN = 15_000;

const PANE_ENTRY = join(import.meta.dirname, '..', '..', '..', 'src', 'pane', 'launch.mjs');
const PLUGIN = join(import.meta.dirname, '..', '..', '..');

interface Terminal { close(): void }
interface Spawned { readonly pid: number; readonly exited: Promise<number>; readonly terminal: Terminal; kill(signal?: number | string): void }
interface BunSpawn { spawn(command: readonly string[], options: { readonly cwd: string; readonly env: Readonly<Record<string, string>>; readonly terminal: { readonly cols: number; readonly rows: number; data(terminal: Terminal, data: Uint8Array): void } }): Spawned }

export interface Column {
    screen(): Screen | null;
    painted(predicate: (screen: Screen) => boolean, what: string): Promise<Screen>;
    close(): Promise<void>;
}

export interface RecapDaemonWorld {
    column(cols: number, rows: number): Column;
    readonly world: DaemonWorld;
    readonly model: ScriptedModel;
    readonly records: string;
    grow(turns: number): void;
    announce(lanes?: readonly string[]): void;
    transcript(session: string, said: readonly string[]): { grow(said: readonly string[]): void };
    reports(session: string): void;
    detects(): void;
    typing(): void;
    turnEnds(pane?: string): void;
    start(): Promise<void>;
    turn(): void;
    status(status: string, pane?: string): void;
    rows(statement: string): readonly Record<string, unknown>[];
    until<T>(probe: () => T | undefined, what: string, waiting?: Waiting): Promise<T>;
    close(): Promise<void>;
}

const paneInfo = (): Record<string, unknown> => ({ pane_id: PANE, tab_id: TAB, workspace_id: 'w1', agent: 'claude', agent_status: 'idle', cwd: '/work', foreground_cwd: '/work', focused: false, revision: 1, terminal_id: 'term1', terminal_title_stripped: 'orchestrator' });

const otherSession = (pane: string): string => `00000000-0000-4000-8000-0000000000${pane.replace(/\D/g, '').padStart(2, '0')}`;

export async function recapDaemonWorld(env: Readonly<Record<string, string>> = {}): Promise<RecapDaemonWorld> {
    const model = scriptedModel();
    const world = await daemonWorld({ env: { TAB_RECAP_CUSTOM_CMD: model.command, ...env } });
    const project = join(world.home, '.claude', 'projects', '-work');
    mkdirSync(project, { recursive: true });
    const records = join(project, `${SESSION}.jsonl`);
    writeFileSync(records, '');
    let written = 0;

    const lane = (status: string): Record<string, unknown> => ({
        pane_id: PANE, tab_id: TAB, workspace_id: 'w1', agent: 'claude', agent_status: status, cwd: '/work', foreground_cwd: '/work', terminal_title_stripped: 'orchestrator',
        agent_session: { source: 'claude', agent: 'claude', kind: 'id', value: SESSION },
    });

    const until = async <T>(probe: () => T | undefined, what: string, waiting: Waiting = {}): Promise<T> => {
        const deadline = Date.now() + (waiting.within ?? WITHIN);
        while (Date.now() < deadline) {
            const seen = probe();
            if (seen !== undefined) { return seen; }
            await new Promise<void>((resolve) => { setTimeout(resolve, EVERY); });
        }
        throw new Error(`timed out: ${what}; the daemon log ends: ${world.log().slice(-600)}`);
    };

    const rows = (statement: string): readonly Record<string, unknown>[] => {
        let db: Database | null = null;
        try {
            db = new Database(join(world.stateDir, 'tab-recap.db'), { readonly: true });
            return db.prepare(statement).all();
        } catch {
            return [];
        } finally {
            db?.close();
        }
    };

    const transcript = (session: string, said: readonly string[]): { grow(more: readonly string[]): void } => {
        const file = join(project, `${session}.jsonl`);
        let turns = 0;
        const grow = (more: readonly string[]): void => {
            appendFileSync(file, more.map((text) => {
                const at = new Date(Date.parse('2026-10-08T09:00:00.000Z') + turns * 60_000).toISOString();
                turns += 1;
                return `${JSON.stringify({ type: 'user', timestamp: at, message: { content: text } })}\n`;
            }).join(''));
        };
        writeFileSync(file, '');
        grow(said);
        return { grow };
    };

    const appendTurn = (turns = 1): void => {
        const lines = TURNS.slice(written * 2, (written + turns) * 2);
        written += turns;
        appendFileSync(records, lines.map((line) => `${line}\n`).join(''));
    };

    const columns: Column[] = [];
    const column = (cols: number, tall: number): Column => {
        const chunks = { text: '' };
        const spawned = (Reflect.get(globalThis, 'Bun') as BunSpawn).spawn([process.execPath, PANE_ENTRY], {
            cwd: PLUGIN,
            env: { ...world.env, TERM: 'xterm-256color', TAB_RECAP_TAB: TAB, LC_ALL: 'C', LC_MESSAGES: 'C', LANG: 'C' },
            terminal: { cols, rows: tall, data: (_terminal, data) => { chunks.text += Buffer.from(data).toString(); } },
        });
        let closed = false;
        const opened: Column = {
            screen: () => screenOf(chunks.text),
            painted: (predicate, what) => until(() => {
                const screen = screenOf(chunks.text);
                return screen !== null && predicate(screen) ? screen : undefined;
            }, `${what}; the screen reads ${JSON.stringify(screenOf(chunks.text)?.plain ?? null)}`),
            close: async () => {
                if (closed) { return; }
                closed = true;
                spawned.kill('SIGTERM');
                await Promise.race([spawned.exited, new Promise<void>((resolve) => { setTimeout(resolve, 5_000); })]);
                spawned.terminal.close();
            },
        };
        columns.push(opened);
        return opened;
    };

    return {
        world, model, records, until, rows, column,
        grow: (turns) => { appendTurn(turns); },
        announce: (panes = [PANE]) => {
            for (const pane of panes.filter((each) => each !== PANE)) {
                transcript(otherSession(pane), ['Review the cart tests in test/cart.test.ts']);
            }
            world.herdr.reply(Method.SessionSnapshot, {
                type: 'session_snapshot',
                snapshot: {
                    agents: panes.map((pane) => ({ ...lane('idle'), pane_id: pane, ...(pane === PANE ? {} : { agent_session: { source: 'claude', agent: 'claude', kind: 'id', value: otherSession(pane) }, terminal_title_stripped: pane }) })),
                    layouts: [], panes: panes.map((pane) => ({ pane_id: pane, tab_id: TAB, workspace_id: 'w1' })), protocol: PROTOCOL, tabs: [{ tab_id: TAB, workspace_id: 'w1' }], version: '0', workspaces: [{ workspace_id: 'w1' }],
                },
            } as never);
        },
        transcript: (session, said) => transcript(session, said),
        reports: (session) => {
            world.herdr.push({ event: 'pane_updated', data: { type: 'pane_updated', pane: { ...paneInfo(), agent_session: { source: 'claude', agent: 'claude', kind: 'id', value: session } } } });
        },
        typing: () => {
            const agent = { agent: 'claude', agent_status: 'idle', pane_id: PANE, tab_id: TAB, workspace_id: 'w1', terminal_id: 'term1', revision: 1, focused: true };
            world.herdr.reply(Method.AgentGet, { type: 'agent_info', agent } as never);
            world.herdr.reply(Method.PaneGet, { type: 'pane_info', pane: { ...agent, tokens: {} } } as never);
            world.herdr.reply(Method.PaneSendText, { type: 'ok' });
            world.herdr.reply(Method.PaneSendKeys, { type: 'ok' });
            world.herdr.reply(Method.AgentPrompt, { type: 'agent_prompted' } as never);
        },
        detects: () => {
            world.herdr.push({ event: 'pane_agent_detected', data: { type: 'pane_agent_detected', pane: paneInfo() } });
        },
        turnEnds: (pane = PANE) => { world.herdr.push({ event: 'pane.agent_status_changed', data: { pane_id: pane, agent_status: 'idle' } }); },
        status: (status, pane = PANE) => { world.herdr.push({ event: 'pane.agent_status_changed', data: { pane_id: pane, agent_status: status } }); },
        start: async () => {
            world.daemon();
            await world.awaitLog(/daemon \d+ up, state in /);
            await until(() => (world.herdr.requests().some((request) => request.method === 'events.subscribe' && JSON.stringify(request.params).includes(`"pane_id":"${PANE}"`)) ? true : undefined), 'the daemon watches the lane');
        },
        turn: () => {
            appendTurn();
            world.herdr.push({ event: 'pane.agent_status_changed', data: { pane_id: PANE, agent_status: 'working' } });
            world.herdr.push({ event: 'pane.agent_status_changed', data: { pane_id: PANE, agent_status: 'idle' } });
        },
        close: async () => {
            for (const open of columns) { await open.close(); }
            await world.close();
            model.clean();
        },
    };
}
