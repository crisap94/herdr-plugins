export type InFlightReason = 'unregistered-reader' | 'screen' | 'windowed-reader';

const REASONS: Readonly<Record<InFlightReason, (agent: string) => string>> = {
    'unregistered-reader': (agent) => `no transcript reader for ${agent}`,
    screen: () => 'screen transcripts do not contain in-flight work',
    'windowed-reader': () => 'windowed replay does not expose in-flight work',
};

export const inFlightReason = (reason: InFlightReason, agent: string): string => REASONS[reason](agent);
