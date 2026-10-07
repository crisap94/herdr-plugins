// The compaction side of herdr: ask an agent how it stands, type one prompt into it, open the note popup.
// It names `agent.prompt`, `pane.send_text` and `pane.send_keys`: nothing else may (rule recap-prompt-boundary).
// It receives the wire from HerdrFleet (the one module that imports the transport) and is the one module that names `agent.prompt`.
import { laneStatus } from '#src/recap/domain/status.ts';
import type { Agents, AgentState, PromptWait, Prompted } from '#src/ports/agents.ts';
import type { Done } from '#src/ports/columns.ts';
import { unknown } from '#src/ports/unknowable.ts';

type Json = Readonly<Record<string, unknown>>;
export type Wire = (method: string, params: Json, timeoutMs?: number) => Promise<Json>;

const COMPACT_ENTRYPOINT = 'compact';
const POPUP_WIDTH = '90%';
const POPUP_HEIGHT = '30%';
/** a reply is awaited this much longer than the wait it asked herdr for */
const WIRE_MARGIN_MS = 15_000;
/** Between the typed text and Enter: an agent's slash-command popup needs a moment, or Enter is swallowed (measured on codex: 0 ms swallows it, 250 ms runs it). */
const ENTER_AFTER_MS = 300;

const detail = (error: unknown): string => (error instanceof Error ? error.message : String(error));
const codeOf = (error: unknown): unknown => (typeof error === 'object' && error !== null ? (error as { code?: unknown }).code : undefined);

export class HerdrAgents implements Agents {
    private readonly wire: Wire;
    private readonly plugin: { readonly id: string; readonly stateDir: string };

    private readonly pause: (ms: number) => Promise<void>;

    constructor(wire: Wire, plugin: { readonly id: string; readonly stateDir: string }, pause: (ms: number) => Promise<void> = (ms): Promise<void> => new Promise((resolve) => { setTimeout(resolve, ms); })) {
        this.wire = wire;
        this.plugin = plugin;
        this.pause = pause;
    }

    async status(pane: string): Promise<AgentState> {
        try {
            const found = (await this.wire('agent.get', { target: pane }))['agent'];
            const fields = typeof found === 'object' && found !== null ? (found as Json) : {};
            return typeof fields['agent'] === 'string'
                ? { kind: 'agent', agent: fields['agent'], status: laneStatus(typeof fields['agent_status'] === 'string' ? fields['agent_status'] : null) }
                : unknown({ why: 'unreadable', detail: `agent.get of ${pane} returned no agent` });
        } catch (error) {
            return unknown({ why: 'unreachable', detail: detail(error) });
        }
    }

    async prompt(pane: string, text: string, wait?: PromptWait): Promise<Prompted> {
        const params: Json = wait === undefined ? { target: pane, text } : { target: pane, text, wait: { until: wait.until, timeout_ms: wait.timeoutMs } };
        try {
            await this.wire('agent.prompt', params, (wait?.timeoutMs ?? 0) + WIRE_MARGIN_MS);
            return { kind: 'sent' };
        } catch (error) {
            // `agent_prompt_stalled`: the text went in but no working state followed — a command the agent runs at once (codex's `/compact`) looks like that
            if (codeOf(error) === 'agent_prompt_stalled') {
                return { kind: 'sent' };
            }
            return codeOf(error) === 'agent_blocked' ? { kind: 'blocked' } : unknown({ why: 'unreachable', detail: detail(error) });
        }
    }

    /**
     * Type one line in pieces and press Enter, as the operator would (no paste): for an agent that takes `/compact <text>` and would
     * treat a pasted block, or a long single send, as content. A piece with a line break is refused; Enter only follows when every piece went in.
     */
    async typeLine(pane: string, pieces: readonly string[]): Promise<Prompted> {
        if (pieces.some((piece) => /[\r\n]/u.test(piece))) {
            return unknown({ why: 'unreadable', detail: 'a typed line has no line break' });
        }
        try {
            for (const piece of pieces) {
                await this.wire('pane.send_text', { pane_id: pane, text: piece });
            }
            await this.pause(ENTER_AFTER_MS);
            await this.wire('pane.send_keys', { pane_id: pane, keys: ['enter'] });
            return { kind: 'sent' };
        } catch (error) {
            return unknown({ why: 'unreachable', detail: detail(error) });
        }
    }

    async askNote(tab: string, pane: string | null): Promise<Done> {
        try {
            await this.wire('plugin.pane.open', {
                plugin_id: this.plugin.id, entrypoint: COMPACT_ENTRYPOINT, placement: 'popup', width: POPUP_WIDTH, height: POPUP_HEIGHT, focus: true,
                env: { TAB_RECAP_TAB: tab, TAB_RECAP_PANE: pane ?? '', TAB_RECAP_STATE: this.plugin.stateDir },
            });
            return { kind: 'done' };
        } catch (error) {
            return unknown({ why: 'unreachable', detail: detail(error) });
        }
    }
}
