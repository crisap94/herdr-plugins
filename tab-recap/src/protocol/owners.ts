import type { TokenName } from './primitives.ts';
import type { Registry } from './registry.ts';

export type OwnerTable = { readonly writable: readonly TokenName[]; readonly readPrefixes: readonly string[] };

export const ownerTable = (registry: Registry): OwnerTable => ({
    writable: registry.ownNames,
    readPrefixes: registry.exchanges.map((exchange) => exchange.requestPrefix),
});
