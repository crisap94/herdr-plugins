import { AgentStatus } from '@stateforge-labs/herdr-sdk';
import { setTimeout as sleep } from 'node:timers/promises';
import { usePlugin } from './client.ts';
import { parseJsonObject, type JsonObject } from './json-object.ts';
import { parseAgentKind, type SessionKey, type ScopeId } from '#src/recap/domain/ids.ts';
import { laneStatus } from '#src/recap/domain/status.ts';
import { parseText, type Text } from '@stateforge-labs/session-ledger';
import { parseMilliseconds, type Duration, type Milliseconds } from '@stateforge-labs/session-ledger';
import type { AgentLookup, LineBehavior, PromptStance, PromptWaitFor, Prompted, AgentPanes } from '#src/ports/agents.ts';
import type { Done } from '#src/ports/columns.ts';
import type { CompactionLine } from '#src/recap/domain/compaction-plan.ts';
import { unknown } from '@stateforge-labs/session-ledger';
import { must } from '@stateforge-labs/session-ledger';
import { causeOf } from '@stateforge-labs/session-ledger';

export type WireMethod = 'agent.get' | 'agent.prompt' | 'pane.send_text' | 'pane.send_keys' | 'plugin.pane.open';
export type Wire = (method: WireMethod, params: JsonObject, timeoutMs?: Milliseconds) => Promise<JsonObject>;

export interface PluginRef {
    readonly id: Text;
    readonly stateDir: Text;
}

export type Pause = (wait: Duration) => Promise<void>;

const WIRE_MARGIN_MS = 15_000;
const POPUP_WIDTH = '90%';
const POPUP_HEIGHT = '30%';
const COMPACT_ENTRYPOINT = 'compact';

const objectOf = (result: ReturnType<typeof parseJsonObject>): JsonObject => (result.kind === 'ok' ? result.value : {});

export class HerdrAgentPanes implements AgentPanes {
    private readonly wire: Wire;
    private readonly plugin: PluginRef;
    private readonly pause: Pause;

    constructor(wire: Wire, plugin: PluginRef, pause: Pause = (wait): Promise<void> => sleep(Number(wait))) {
        this.wire = wire;
        this.plugin = plugin;
        this.pause = pause;
    }

    async status(pane: SessionKey): Promise<AgentLookup> {
        try {
            const fields = objectOf(parseJsonObject((await this.wire('agent.get', { target: pane }))['agent']));
            const agent = parseAgentKind(fields['agent']);
            const raw = parseText(fields['agent_status']);
            return agent.kind === 'ok'
                ? { kind: 'agent', agent: agent.value, status: laneStatus(raw.kind === 'ok' ? raw.value : null) }
                : unknown({ why: 'unreadable', detail: causeOf(must(parseText(`agent.get of ${pane} returned no agent`))) });
        } catch (error) {
            const code = error instanceof Object && 'code' in error ? error.code : undefined;
            return code === 'agent_not_found'
                ? unknown({ why: 'not-found', what: must(parseText(`agent ${pane}`)) })
                : unknown({ why: 'unreachable', detail: causeOf(must(parseText(error instanceof Error ? error.message : 'herdr call failed'))) });
        }
    }

    async prompt(pane: SessionKey, text: Text, wait: PromptWaitFor | undefined, behavior: PromptStance): Promise<Prompted> {
        const params: JsonObject = wait === undefined
            ? { target: pane, text }
            : { target: pane, text, wait: { until: wait.until, timeout_ms: Number(wait.timeout) } };
        const budget = wait === undefined ? 0 : Number(wait.timeout);
        try {
            await this.wire('agent.prompt', params, must(parseMilliseconds(budget + WIRE_MARGIN_MS)));
            return { kind: 'sent' };
        } catch (error) {
            const code = error instanceof Object && 'code' in error ? error.code : undefined;
            if (code === 'agent_prompt_stalled' && behavior.stall === 'accepts-stall') {
                return { kind: 'sent' };
            }
            return code === 'agent_blocked'
                ? { kind: 'blocked' }
                : unknown({ why: 'unreachable', detail: causeOf(must(parseText(error instanceof Error ? error.message : 'herdr call failed'))) });
        }
    }

    async typeLine(pane: SessionKey, line: CompactionLine, behavior: LineBehavior): Promise<Prompted> {
        if (line.pieces.some((piece) => /[\r\n]/u.test(piece))) {
            return unknown({ why: 'unreadable', detail: causeOf(must(parseText('a typed line has no line break'))) });
        }
        try {
            for (const piece of line.pieces) {
                await this.wire('pane.send_text', { pane_id: pane, text: piece });
            }
            await this.pause(behavior.enterDelay);
            await this.wire('pane.send_keys', { pane_id: pane, keys: ['enter'] });
            return { kind: 'sent' };
        } catch (error) {
            return unknown({ why: 'unreachable', detail: causeOf(must(parseText(error instanceof Error ? error.message : 'herdr call failed'))) });
        }
    }

    async askNote(tab: ScopeId, pane: SessionKey | null): Promise<Done> {
        try {
            await this.wire('plugin.pane.open', {
                plugin_id: this.plugin.id,
                entrypoint: COMPACT_ENTRYPOINT,
                placement: 'popup',
                width: POPUP_WIDTH,
                height: POPUP_HEIGHT,
                focus: true,
                env: { TAB_RECAP_TAB: tab, TAB_RECAP_PANE: pane ?? '', TAB_RECAP_STATE: this.plugin.stateDir },
            });
            return { kind: 'done' };
        } catch (error) {
            return unknown({ why: 'unreachable', detail: causeOf(must(parseText(error instanceof Error ? error.message : 'herdr call failed'))) });
        }
    }
}

const EMPTY = must(parseText(''));
const textOf = (result: ReturnType<typeof parseText>): Text => (result.kind === 'ok' ? result.value : EMPTY);

type Handler = (params: JsonObject, timeoutMs: Milliseconds | undefined) => Promise<JsonObject>;

const handlers: Record<WireMethod, Handler> = {
    'agent.get': async (params): Promise<JsonObject> => {
        const target = textOf(parseText(params['target']));
        return objectOf(parseJsonObject(await usePlugin((client) => client.call('agent.get', { target }))));
    },
    'agent.prompt': async (params, timeoutMs): Promise<JsonObject> => {
        const target = textOf(parseText(params['target']));
        const text = textOf(parseText(params['text']));
        const wait = objectOf(parseJsonObject(params['wait']));
        const waitUntil = wait['until'];
        const until = Object.values(AgentStatus).filter((status) => Array.isArray(waitUntil) && waitUntil.includes(status));
        const timeout = typeof wait['timeout_ms'] === 'number' ? wait['timeout_ms'] : null;
        const request = params['wait'] === undefined ? { target, text } : { target, text, wait: { until, timeout_ms: timeout } };
        const options = timeoutMs === undefined ? undefined : { timeoutMs: Number(timeoutMs) };
        return objectOf(parseJsonObject(await usePlugin((client) => client.call('agent.prompt', request, options))));
    },
    'pane.send_text': async (params): Promise<JsonObject> => {
        const pane = textOf(parseText(params['pane_id']));
        const text = textOf(parseText(params['text']));
        return objectOf(parseJsonObject(await usePlugin((client) => client.call('pane.send_text', { pane_id: pane, text }))));
    },
    'pane.send_keys': async (params): Promise<JsonObject> => {
        const pane = textOf(parseText(params['pane_id']));
        const keys = params['keys'];
        const names = Array.isArray(keys) ? keys.map((key) => String(key)) : [];
        return objectOf(parseJsonObject(await usePlugin((client) => client.call('pane.send_keys', { pane_id: pane, keys: names }))));
    },
    'plugin.pane.open': async (params): Promise<JsonObject> => {
        const env = objectOf(parseJsonObject(params['env']));
        const pairs = Object.entries(env).flatMap(([key, item]) => {
            const name = parseText(key);
            const value = parseText(item);
            return name.kind === 'ok' && value.kind === 'ok' ? [[name.value, value.value] as const] : [];
        });
        return objectOf(parseJsonObject(await usePlugin((client) => client.call('plugin.pane.open', {
            plugin_id: textOf(parseText(params['plugin_id'])),
            entrypoint: textOf(parseText(params['entrypoint'])),
            placement: 'popup',
            width: textOf(parseText(params['width'])),
            height: textOf(parseText(params['height'])),
            focus: true,
            env: Object.fromEntries(pairs),
        }))));
    },
};

export function herdrWire(method: WireMethod, params: JsonObject, timeoutMs?: Milliseconds): Promise<JsonObject> {
    return handlers[method](params, timeoutMs);
}
