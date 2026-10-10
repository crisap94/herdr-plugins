export type InFlightReason = 'unregistered-reader';

const REASONS: Readonly<Record<InFlightReason, (agent: string) => string>> = {
    'unregistered-reader': (agent) => `no transcript reader for ${agent}`,
};

export const inFlightReason = (reason: InFlightReason, agent: string): string => REASONS[reason](agent);
