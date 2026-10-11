import { err, ok, type Result } from '#src/protocol/result.ts';
import { brand, type Brand } from './brand.ts';
import type { ParseFailure } from './parse-failure.ts';

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

export type Milliseconds = Brand<number, 'Milliseconds'>;

export function parseMilliseconds(input: unknown): Result<Milliseconds, ParseFailure> {
    if (typeof input !== 'number' || !Number.isFinite(input)) {
        return err({ kind: 'not-a-number' });
    }
    if (input < 0) {
        return err({ kind: 'out-of-range' });
    }
    return ok(brand<number, 'Milliseconds'>(input));
}

export function parseInstant(input: unknown): Result<Instant, ParseFailure> {
    const ms = parseMilliseconds(input);
    if (ms.kind === 'err') {
        return ms;
    }
    return ok(brand<number, 'Instant'>(ms.value));
}

export function parseDuration(input: unknown): Result<Duration, ParseFailure> {
    const ms = parseMilliseconds(input);
    if (ms.kind === 'err') {
        return ms;
    }
    return ok(brand<number, 'Duration'>(ms.value));
}
