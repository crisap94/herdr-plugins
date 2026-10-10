export type TelemetryTags = 'on' | 'off';

export const telemetryTagsOf = (raw: string | undefined): TelemetryTags => (raw?.trim().toLowerCase() === 'on' ? 'on' : 'off');
