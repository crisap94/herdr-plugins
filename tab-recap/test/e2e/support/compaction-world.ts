import { appendFileSync } from 'node:fs';
import { request } from 'node:http';
import { join } from 'node:path';
import { Method, PROTOCOL } from '@stateforge-labs/herdr-sdk';
import { add } from './engine-world.ts';
import { recapDaemonWorld, PANE, SESSION, TAB, type RecapDaemonWorld } from './recap-daemon-world.ts';

export { PANE, SESSION, TAB };

export const GOAL = 'Add a cart to the shop';
export const BRIEF = 'Keep the cart goal and the totals in src/totals.ts.';

const TYPED = new Set(['pane.send_text', 'pane.send_keys', 'agent.prompt']);

export interface Replied {
    readonly status: number;
    readonly body: string;
}

export interface LaneSpec {
    readonly pane: string;
    readonly agent: string;
    readonly status: string;
    readonly cwd?: string;
    readonly session?: string;
}

export interface CompactionWorld {
    readonly world: RecapDaemonWorld;
    typed(pane?: string): readonly string[];
    toasts(): readonly string[];
    compactions(): readonly Record<string, unknown>[];
    mark(at?: number): void;
    failMark(at?: number): void;
    hook(path: string, body: Readonly<Record<string, unknown>>): Promise<Replied>;
    sessionStart(session?: string): Promise<Replied>;
    lanes(specs: readonly LaneSpec[]): void;
    settle(pane?: string): void;
    agentIs(status: string, session?: string): void;
    agentGoes(statuses: readonly string[], then?: string): void;
    compacts(): Promise<void>;
    typedCount(pane?: string): number;
    awaitTyped(count: number, pane?: string): Promise<readonly string[]>;
    awaitStage(stage: string, pane?: string): Promise<Record<string, unknown>>;
    close(): Promise<void>;
}

const agentOf = (status: string): Record<string, unknown> => ({ agent: 'claude', agent_status: status, pane_id: PANE, tab_id: TAB, workspace_id: 'w1', terminal_id: 'term1', revision: 1, focused: true });

function describeRequest(method: string, params: unknown): string {
    const fields = params as Record<string, unknown>;
    if (method === 'pane.send_text') {
        return `text ${String(fields['text'])}`;
    }
    if (method === 'pane.send_keys') {
        return `keys ${(fields['keys'] as readonly string[]).join('+')}`;
    }
    return `prompt ${String(fields['text'])}`;
}

function paneOf(params: unknown): string {
    const fields = params as Record<string, unknown>;
    return String(fields['pane_id'] ?? fields['target']);
}

export async function compactionWorld(env: Readonly<Record<string, string>> = {}): Promise<CompactionWorld> {
    const world = await recapDaemonWorld({ TAB_RECAP_RUN_PACING: 'turn', TAB_RECAP_COMPACT_NOTE: 'skip', ...env });
    const herdr = world.world.herdr;

    const typed = (pane: string = PANE): readonly string[] => herdr.requests()
        .filter((each) => TYPED.has(each.method) && paneOf(each.params) === pane)
        .map((each) => describeRequest(each.method, each.params));

    const toasts = (): readonly string[] => herdr.requests()
        .filter((each) => each.method === 'notification.show')
        .map((each) => {
            const fields = each.params as Record<string, unknown>;
            return `${String(fields['title'])} | ${String(fields['body'])}`;
        });

    const compactions = (): readonly Record<string, unknown>[] => world.rows('SELECT pane, agent, stage, brief, writer, template_why, tokens_before, tokens_after, took_ms, retried, why, queued, origin, finished_at, dismissed_at FROM compaction ORDER BY started_at');

    const hook = (path: string, body: Readonly<Record<string, unknown>>): Promise<Replied> => new Promise((resolve, reject) => {
        const sent = request({ socketPath: join(world.world.stateDir, 'hooks', 'hooks.sock'), method: 'POST', path, headers: { host: 'localhost', 'content-type': 'application/json' } }, (response) => {
            const chunks: Buffer[] = [];
            response.on('data', (chunk: Buffer) => { chunks.push(chunk); });
            response.on('end', () => { resolve({ status: response.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') }); });
            response.on('error', reject);
        });
        sent.on('error', reject);
        sent.end(JSON.stringify(body));
    });

    return {
        world,
        typed,
        toasts,
        compactions,
        hook,
        typedCount: (pane = PANE) => typed(pane).length,
        mark: (at = Date.now()) => {
            appendFileSync(world.records, `${JSON.stringify({ type: 'system', subtype: 'compact_boundary', content: 'Conversation compacted', compactMetadata: { trigger: 'manual', preTokens: 39532, postTokens: 3057, durationMs: 15588 }, timestamp: new Date(at).toISOString(), sessionId: SESSION })}\n`);
        },
        failMark: (at = Date.now()) => {
            appendFileSync(world.records, `${JSON.stringify({ type: 'system', subtype: 'local_command', content: '<local-command-stderr>Error during compaction: summarization produced empty response</local-command-stderr>', timestamp: new Date(at).toISOString(), sessionId: SESSION })}\n`);
        },
        sessionStart: (session = SESSION) => hook('/hook/claude', { session_id: session, hook_event_name: 'SessionStart', source: 'compact', cwd: '/work' }),
        lanes: (specs) => {
            herdr.reply(Method.SessionSnapshot, {
                type: 'session_snapshot',
                snapshot: {
                    agents: specs.map((spec) => ({
                        pane_id: spec.pane, tab_id: TAB, workspace_id: 'w1', agent: spec.agent, agent_status: spec.status, cwd: spec.cwd ?? '/work', foreground_cwd: spec.cwd ?? '/work', terminal_title_stripped: spec.pane,
                        ...(spec.session === undefined ? {} : { agent_session: { source: spec.agent, agent: spec.agent, kind: 'id', value: spec.session } }),
                    })),
                    layouts: [], panes: specs.map((spec) => ({ pane_id: spec.pane, tab_id: TAB, workspace_id: 'w1' })), protocol: PROTOCOL, tabs: [{ tab_id: TAB, workspace_id: 'w1' }], version: '0', workspaces: [{ workspace_id: 'w1' }],
                },
            } as never);
        },
        agentIs: (status, session) => {
            const agent = { agent: 'claude', agent_status: status, pane_id: PANE, tab_id: TAB, workspace_id: 'w1', terminal_id: 'term1', revision: 1, focused: true };
            herdr.reply(Method.AgentGet, { type: 'agent_info', agent } as never);
            herdr.reply(Method.PaneGet, { type: 'pane_info', pane: { ...agent, tokens: {}, ...(session === undefined ? {} : { agent_session: { source: 'claude', agent: 'claude', kind: 'id', value: session } }) } } as never);
        },
        agentGoes: (statuses, then = statuses.at(-1) ?? 'idle') => {
            const gone = { code: 'agent_not_found', message: 'no such agent' };
            herdr.replySequence(Method.AgentGet, statuses.map((status) => (status === 'gone' ? { error: gone } : { result: { type: 'agent_info', agent: agentOf(status) } })) as never);
            if (then === 'gone') {
                herdr.fail(Method.AgentGet, gone);
            } else {
                herdr.reply(Method.AgentGet, { type: 'agent_info', agent: agentOf(then) } as never);
            }
        },
        compacts: async () => {
            const typedAt = Date.now();
            await hook('/pre-compact/claude', { session_id: SESSION, trigger: 'manual' });
            appendFileSync(world.records, `${JSON.stringify({ type: 'system', subtype: 'compact_boundary', content: 'Conversation compacted', compactMetadata: { trigger: 'manual', preTokens: 39532, postTokens: 3057, durationMs: 15588 }, timestamp: new Date(typedAt).toISOString(), sessionId: SESSION })}\n`);
            world.status('working');
            world.status('idle');
        },
        settle: (pane = PANE) => {
            world.status('working', pane);
            world.status('idle', pane);
        },
        awaitTyped: (count, pane = PANE) => world.until(() => (typed(pane).length >= count ? typed(pane) : undefined), `${count} typed requests into ${pane}; typed so far: ${JSON.stringify(typed(pane))}`),
        awaitStage: (stage, pane = PANE) => world.until(() => compactions().findLast((row) => row['pane'] === pane && row['stage'] === stage), `a ${stage} compaction of ${pane}; the rows read ${JSON.stringify(compactions())}`),
        close: () => world.close(),
    };
}

export const recapOps = (text: string): string => JSON.stringify({ ops: [add('goal', text, text)] });
