export type HistoryWhy = 'history-unavailable';
export type InFlightWhy = 'unregistered-reader' | 'screen' | 'windowed-reader' | 'in-flight-unavailable';
export type ContextWindowWhy = 'context-window-unavailable';
export type CompactionWhy = 'compaction-unavailable';

type CapabilityWhy = HistoryWhy | InFlightWhy | ContextWindowWhy | CompactionWhy;

const WORDING: Readonly<Record<CapabilityWhy, (agent: string) => string>> = {
    'history-unavailable': (agent) => `no reader for ${agent}`,
    'unregistered-reader': (agent) => `no transcript reader for ${agent}`,
    screen: () => 'screen transcripts do not contain in-flight work',
    'windowed-reader': () => 'windowed replay does not expose in-flight work',
    'in-flight-unavailable': (agent) => `no transcript reader for ${agent}`,
    'context-window-unavailable': () => 'context window is unavailable',
    'compaction-unavailable': (agent) => `no compaction plan is registered for ${agent}`,
};

export const capabilityWording = (why: CapabilityWhy, agent: string): string => WORDING[why](agent);

export const inFlightReason = (why: InFlightWhy, agent: string): string => capabilityWording(why, agent);
