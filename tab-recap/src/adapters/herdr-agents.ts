import { laneStatus } from '#src/recap/domain/status.ts';
import type { Agents, AgentState, LineBehavior, PromptBehavior, PromptWait, Prompted } from '#src/ports/agents.ts';
import type { Done } from '#src/ports/columns.ts';
import { unknown } from '#src/ports/unknowable.ts';

type Json = Readonly<Record<string, unknown>>;
export type Wire = (method: string, params: Json, timeoutMs?: number) => Promise<Json>;

const COMPACT_ENTRYPOINT = 'compact';
const POPUP_WIDTH = '90%';
const POPUP_HEIGHT = '30%';
const WIRE_MARGIN_MS = 15_000;
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

    async prompt(pane: string, text: string, wait?: PromptWait, behavior?: PromptBehavior): Promise<Prompted> {
        const params: Json = wait === undefined ? { target: pane, text } : { target: pane, text, wait: { until: wait.until, timeout_ms: wait.timeoutMs } };
        try {
            await this.wire('agent.prompt', params, (wait?.timeoutMs ?? 0) + WIRE_MARGIN_MS);
            return { kind: 'sent' };
        } catch (error) {
            if (codeOf(error) === 'agent_prompt_stalled' && behavior?.acceptsStall === true) {
                return { kind: 'sent' };
            }
            return codeOf(error) === 'agent_blocked' ? { kind: 'blocked' } : unknown({ why: 'unreachable', detail: detail(error) });
        }
    }

    async typeLine(pane: string, line: { readonly pieces: readonly string[] }, behavior: LineBehavior): Promise<Prompted> {
        const pieces = line.pieces;
        if (pieces.some((piece) => /[\r\n]/u.test(piece))) {
            return unknown({ why: 'unreadable', detail: 'a typed line has no line break' });
        }
        try {
            for (const piece of pieces) {
                await this.wire('pane.send_text', { pane_id: pane, text: piece });
            }
            await this.pause(behavior.enterDelay);
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
