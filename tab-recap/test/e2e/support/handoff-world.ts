import { Database } from 'bun:sqlite';
import { join } from 'node:path';
import { Method, PROTOCOL } from '@stateforge-labs/herdr-sdk';
import { recapDaemonWorld, SESSION, TAB, type RecapDaemonWorld } from './recap-daemon-world.ts';

export const SOURCE = 'w1:p1';
export const TARGET = 'w1:p3';

export interface Seeded {
    readonly section: string;
    readonly text: string;
    readonly why?: string;
    readonly closedAt?: number;
}

export interface HandoffWorld {
    readonly recap: RecapDaemonWorld;
    prompts(): readonly string[];
    prompted(count?: number): Promise<string>;
    ready(): void;
    seed(facts: readonly Seeded[]): void;
    write(statement: string): void;
    close(): Promise<void>;
}

export interface HandoffOptions {
    readonly answers: readonly string[];
    readonly target?: string;
    readonly recapped?: boolean;
    readonly env?: Readonly<Record<string, string>>;
}

const quoted = (text: string): string => `'${text.replaceAll("'", "''")}'`;

const lane = (pane: string, agent: string, status: string, session: string): Record<string, unknown> => ({
    pane_id: pane, tab_id: TAB, workspace_id: 'w1', agent, agent_status: status, cwd: '/work', foreground_cwd: '/work', terminal_title_stripped: pane,
    agent_session: { source: agent, agent, kind: 'id', value: session },
});

export async function handoffWorld(options: HandoffOptions): Promise<HandoffWorld> {
    const kind = options.target ?? 'codex';
    const recap = await recapDaemonWorld({ TAB_RECAP_RUN_PACING: 'turn', TAB_RECAP_COMPACT_NOTE: 'skip', ...options.env });
    options.answers.forEach((text, index) => { recap.model.answer(index + 1, text); });
    recap.model.answer('default', JSON.stringify({ ops: [] }));
    recap.typing();
    const { herdr } = recap.world;
    const snapshot = {
        agents: [lane(SOURCE, 'claude', 'idle', SESSION), lane(TARGET, kind, 'idle', '00000000-0000-4000-8000-0000000000c3')],
        layouts: [], panes: [SOURCE, TARGET].map((pane) => ({ pane_id: pane, tab_id: TAB, workspace_id: 'w1' })), protocol: PROTOCOL, tabs: [{ tab_id: TAB, workspace_id: 'w1' }], version: '0', workspaces: [{ workspace_id: 'w1' }],
    };
    herdr.reply(Method.SessionSnapshot, { type: 'session_snapshot', snapshot } as never);
    const agentOf = (status: string): never => ({ type: 'agent_info', agent: { agent: kind, agent_status: status, pane_id: TARGET, tab_id: TAB, workspace_id: 'w1', terminal_id: 'term3', revision: 1, focused: false } }) as never;
    herdr.reply(Method.AgentGet, agentOf('idle'));
    herdr.reply(Method.PaneGet, { type: 'pane_info', pane: { ...lane(SOURCE, 'claude', 'idle', SESSION), tokens: {} } } as never);
    recap.grow(1);
    await recap.start();
    if (options.recapped !== false) {
        recap.turn();
        await recap.until(() => (recap.rows('SELECT id FROM run').length === 1 ? true : undefined), 'the first run');
    }
    const prompts = (): readonly string[] => herdr.requests().filter((request) => request.method === 'agent.prompt').map((request) => (request.params as { text: string }).text);
    const write = (statement: string): void => {
        const db = new Database(join(recap.world.stateDir, 'tab-recap.db'));
        try {
            db.exec('PRAGMA busy_timeout = 5000');
            db.exec(statement);
        } finally {
            db.close();
        }
    };
    const seed = (facts: readonly Seeded[]): void => {
        const base = Date.now() - 600_000;
        const rows = facts.map((fact, index) => `INSERT INTO fact (id, tab_id, task_id, section, text, why, ref, agent, first_at, last_at, state, closed_why, closed_at, born_run, last_run, language) SELECT randomblob(16), '${TAB}', (SELECT id FROM task LIMIT 1), '${fact.section}', ${quoted(fact.text)}, ${fact.why === undefined ? 'NULL' : quoted(fact.why)}, NULL, NULL, ${base + index}, ${base + index}, ${fact.closedAt === undefined ? "'open', NULL, NULL" : `'closed', 'done', ${fact.closedAt}`}, (SELECT id FROM run ORDER BY at DESC LIMIT 1), (SELECT id FROM run ORDER BY at DESC LIMIT 1), 'en';`);
        write(`DELETE FROM fact; ${rows.join('\n')}`);
    };
    return {
        recap, prompts, write, seed,
        prompted: async (count = 1) => {
            const text = await recap.until(() => prompts().at(count - 1), 'the target lane was prompted', { within: 20_000 });
            herdr.reply(Method.AgentGet, agentOf('working'));
            return text;
        },
        ready: () => { herdr.reply(Method.AgentGet, agentOf('idle')); },
        close: () => recap.close(),
    };
}
