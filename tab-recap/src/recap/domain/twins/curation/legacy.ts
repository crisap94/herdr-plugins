export interface Merge { readonly id: string; readonly into: string; }

export function isObject(value: unknown): value is Readonly<Record<string, unknown>> { return typeof value === 'object' && value !== null && !Array.isArray(value); }

export interface Merged { readonly ids: ReadonlySet<string>; readonly targets: ReadonlySet<string>; }

function closeRefusal(op: Readonly<Record<string, unknown>>, open: ReadonlySet<string>, merged: Merged): string | null {
    const [id, into] = [op['id'], op['into']];
    if (op['why'] !== 'merged' || typeof into !== 'string') {
        return `close ${String(id)} must say why "merged" and the fact it merges into`;
    }
    if (typeof id !== 'string' || !open.has(id) || merged.ids.has(id)) {
        return `${String(id)} is not an open fact (or is already merged)`;
    }
    if (merged.targets.has(id)) {
        return `${id} is where another fact was merged: it stays open`;
    }
    return id === into || !open.has(into) || merged.ids.has(into) ? `${id} cannot merge into ${into}` : null;
}

function refusal(op: unknown, open: ReadonlySet<string>, merged: Merged): string | null {
    if (!isObject(op)) {
        return 'not an operation';
    }
    return op['op'] === 'close' ? closeRefusal(op, open, merged) : `${String(op['op'])} is not allowed: the curator may only close`;
}

export function parseMerge(op: unknown): Merge | null { return isObject(op) && typeof op['id'] === 'string' && typeof op['into'] === 'string' ? { id: op['id'], into: op['into'] } : null; }

export function verdictOf(op: unknown, open: ReadonlySet<string>, merged: Merged): Merge | string { return refusal(op, open, merged) ?? parseMerge(op) ?? 'not an operation'; }
