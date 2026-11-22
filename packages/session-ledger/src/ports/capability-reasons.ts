import { textOf, type Text } from '#src/recap/domain/text.ts';

export type HistoryWhy = 'history-unavailable';
export type InFlightWhy = 'unregistered-reader' | 'screen' | 'windowed-reader' | 'in-flight-unavailable';
export type SplitWhy = 'claude-background-lost' | 'codex-cells' | 'opencode-parts';
export type ContextWindowWhy = 'context-window-unavailable';
export type CompactionWhy = 'compaction-unavailable';


type CapabilityWhy = HistoryWhy | InFlightWhy | SplitWhy | ContextWindowWhy | CompactionWhy;

const WORDING: Readonly<Record<CapabilityWhy, (agent: Text) => Text>> = {
    'history-unavailable': (agent) => textOf(`no reader for ${agent}`),
    'unregistered-reader': (agent) => textOf(`no transcript reader for ${agent}`),
    screen: () => textOf('screen transcripts do not contain in-flight work'),
    'windowed-reader': () => textOf('windowed replay does not expose in-flight work'),
    'in-flight-unavailable': (agent) => textOf(`no transcript reader for ${agent}`),
    'claude-background-lost': (agent) => textOf(`${agent} background work does not survive a compaction on this version`),
    'codex-cells': (agent) => textOf(`${agent} cannot tell background work that survives a compaction`),
    'opencode-parts': (agent) => textOf(`${agent} cannot tell background work that survives a compaction`),
    'context-window-unavailable': () => textOf('context window is unavailable'),
    'compaction-unavailable': (agent) => textOf(`no compaction plan is registered for ${agent}`),
};

export const capabilityWording = (why: CapabilityWhy, agent: Text): Text => WORDING[why](agent);

export const splitReason = (why: SplitWhy, agent: Text): Text => capabilityWording(why, agent);

export const inFlightReason = (why: InFlightWhy, agent: Text): Text => capabilityWording(why, agent);
