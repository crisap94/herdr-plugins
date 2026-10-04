import type { Brand } from './brand.ts';

export type Instant = Brand<number, 'Instant'>;
export type Duration = Brand<number, 'Duration'>;

export function instant(ms: number): Instant {
    return ms as Instant;
}

export function duration(ms: number): Duration {
    return ms as Duration;
}

export function elapsed(from: Instant, to: Instant): Duration {
    return duration(Math.max(0, to - from));
}
