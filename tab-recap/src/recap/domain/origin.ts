export type Origin = 'operator' | 'auto' | 'request';

export function parseOrigin(input: unknown): Origin {
    return input === 'auto' || input === 'request' ? input : 'operator';
}

