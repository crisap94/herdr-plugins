export type Mode = 'open' | 'closed';

export function pick(mode: Mode | null): Mode | undefined {
    return mode ?? undefined;
}

export function fail(message: 'refused'): never {
    throw new Error(message);
}

export function track(mode: Mode): void {
    if (mode === 'open') {
        return;
    }
}
