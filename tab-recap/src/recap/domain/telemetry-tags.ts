export type TelemetryTags = 'on' | 'off';

export function telemetryTagsOf(value: string | undefined): TelemetryTags {
    return value === 'on' ? 'on' : 'off';
}
