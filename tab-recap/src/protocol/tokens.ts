import type { TokenName, TokenValue } from './primitives.ts';

export type TokenMap = Readonly<Record<string, string>>;

export type TokenWrite = { readonly name: TokenName; readonly value: TokenValue | null };
