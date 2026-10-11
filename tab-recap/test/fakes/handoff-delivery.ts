import { handoffPlans } from '#src/adapters/handoff-plan-registry.ts';
import type { AgentState, Agents, Prompted, PromptBehavior, PromptWait } from '#src/ports/agents.ts';
import type { Located, PromptResult, Transcripts, ChunkResult } from '#src/ports/transcripts.ts';
import { unknown, type Unknown } from '#src/ports/unknowable.ts';
import type { Acquired } from '#src/recap/application/typing-lease.ts';
import type { CurrentSession } from '#src/recap/application/lane-recent.ts';
import type { HandoffTyping } from '#src/recap/application/handoff-sender.ts';
import type { Ready } from '#src/recap/application/handoff-target.ts';
import type { HandoffEvidence, HandoffPlan } from '#src/recap/domain/handoff-plan.ts';
import { laneFrom } from '#src/recap/domain/lane.ts';
import type { Lane, SeenLane } from '#src/recap/domain/lane.ts';
import { registryWith } from './transcript-registry.ts';

export interface Faults {
    readonly session?: boolean;
    readonly locate?: boolean;
    readonly latest?: boolean;
    readonly status?: boolean;
    readonly prompt?: boolean;
}

export interface Sent {
    readonly pane: string;
    readonly text: string;
    readonly wait: PromptWait | undefined;
    readonly behavior: PromptBehavior;
}

export interface World {
    session: string | null | Unknown;
    located: boolean;
    latest: string | null;
    unreadable: boolean;
    agentState: AgentState;
    sendReply: Prompted;
    faults: Faults;
    pauses: number[];
    sent: Sent[];
    statusReads: number;
    locates: number;
    onPause: (count: number) => void;
    onSend: (text: string) => void;
}

export function worldOf(over: Partial<World> = {}): World {
    return {
        session: 'sess-1',
        located: true,
        latest: null,
        unreadable: false,
        agentState: { kind: 'agent', agent: 'claude', status: 'idle' },
        sendReply: { kind: 'sent' },
        faults: {},
        pauses: [],
        sent: [],
        statusReads: 0,
        locates: 0,
        onPause: (): void => undefined,
        onSend: (): void => undefined,
        ...over,
    };
}

function transcriptsOf(world: World): Transcripts {
    return {
        agent: 'claude',
        locate: async (lane: Lane): Promise<Located> => {
            world.locates += 1;
            if (world.faults.locate) {
                throw new Error('locate failed');
            }
            return world.located && lane.session !== null ? { kind: 'located', source: 'transcript-1' } : unknown({ why: 'not-found', what: 'transcript' });
        },
        read: async (): Promise<ChunkResult> => unknown({ why: 'unreadable', detail: 'not used by handoff' }),
        latestPrompt: async (): Promise<PromptResult> => {
            if (world.faults.latest) {
                throw new Error('latest failed');
            }
            return world.unreadable ? unknown({ why: 'unreadable', detail: 'tail' }) : { kind: 'prompt', text: world.latest };
        },
        inFlight: { kind: 'unsupported', why: 'unregistered-reader' },
    };
}

export function registryOf(world: World): ReturnType<typeof registryWith> {
    return registryWith({ claude: transcriptsOf(world) });
}

export function sessionOf(world: World): CurrentSession {
    return async (): Promise<string | null | Unknown> => {
        if (world.faults.session) {
            throw new Error('session failed');
        }
        return world.session;
    };
}

export function agentsOf(world: World): Pick<Agents, 'prompt' | 'status'> {
    return {
        status: async (): Promise<AgentState> => {
            world.statusReads += 1;
            if (world.faults.status) {
                throw new Error('status failed');
            }
            return world.agentState;
        },
        prompt: async (pane: string, text: string, wait: PromptWait | undefined, behavior: PromptBehavior): Promise<Prompted> => {
            world.sent.push({ pane, text, wait, behavior });
            if (world.faults.prompt) {
                throw new Error('send failed');
            }
            if (world.sendReply.kind === 'sent') {
                world.onSend(text);
            }
            return world.sendReply;
        },
    };
}

export function pauseOf(world: World): (ms: number) => Promise<void> {
    return async (ms: number): Promise<void> => {
        world.pauses.push(ms);
        world.onPause(world.pauses.length);
    };
}

export interface LeaseSpy {
    readonly port: HandoffTyping;
    readonly acquired: [string, number][];
    readonly released: string[];
}

export function leaseSpy(result: Acquired): LeaseSpy {
    const acquired: [string, number][] = [];
    const released: string[] = [];
    return {
        acquired,
        released,
        port: {
            acquire: async (pane: string, waitMs: number): Promise<Acquired> => {
                acquired.push([pane, waitMs]);
                return result;
            },
            release: async (pane: string): Promise<void> => {
                released.push(pane);
            },
        },
    };
}

const registered = handoffPlans.forKind('claude');
if (registered.kind !== 'supported') {
    throw new Error('claude must declare a handoff plan for the fixtures');
}
const CLAUDE_PLAN: HandoffPlan = registered.plan;

export const PANE = 'w1:p1';

export function planWith(evidence: HandoffEvidence): HandoffPlan {
    return { ...CLAUDE_PLAN, evidence };
}

export function laneWith(over: Partial<SeenLane> = {}): Lane {
    return laneFrom({ paneId: PANE, tabId: 'w1:t1', workspaceId: 'w1', agent: 'claude', status: 'idle', session: 'sess-1', cwd: '/repo', ...over });
}

export function readyOf(lane: Lane, plan: HandoffPlan, ownTranscript = true): Ready {
    return { kind: 'ready', lane, plan, ownTranscript };
}
