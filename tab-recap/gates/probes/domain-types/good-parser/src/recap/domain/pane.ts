import { brand, type Brand } from './brand.js';

export type PaneId = Brand<string, 'PaneId'>;

export type IdentifierError = 'empty' | 'malformed';

export type Result<T, E> = { readonly kind: 'ok'; readonly value: T } | { readonly kind: 'err'; readonly error: E };

export function parsePaneId(input: unknown): Result<PaneId, IdentifierError> {
    return typeof input === 'string' && input.length > 0
        ? { kind: 'ok', value: brand(input, 'PaneId') }
        : { kind: 'err', error: 'empty' };
}
