import { countOf, type Count } from './count.ts';
import { kindsWith, REGISTERED_KINDS, type RegisteredKind, type RegisteredKindTable } from './registered-kinds.ts';
import { textOf, type Text } from './text.ts';

export const COMPACTABLE = compactableKinds(REGISTERED_KINDS);

export type WindowSource = 'agent' | 'catalogue' | 'table' | 'observed' | 'setting';

export type WindowOf = (observed: ContextObserved) => WindowBasis | null;

export function compactableKinds(table: RegisteredKindTable): readonly RegisteredKind[] {
    return kindsWith(table, 'compactable');
}

export type CompactTarget = { readonly kind: 'focused' } | { readonly kind: 'all' } | { readonly kind: 'kinds'; readonly kinds: readonly Text[] };

export const HINT_DEFAULT = 40;
export const HINT_MIN = 10;
export const HINT_MAX = 95;

const list = (raw: Text | undefined): readonly Text[] => [...new Set((raw ?? '').split(/[\s,]+/).map((word) => textOf(word.toLowerCase())).filter((word) => word !== ''))];

export function parseCompactTarget(input: unknown): CompactTarget {
    const kinds = list(typeof input === 'string' ? textOf(input) : undefined);
    if (kinds.some((kind) => kind === 'all')) return { kind: 'all' };
    const chosen = kinds.filter((kind) => kind !== 'focused');
    return kinds.some((kind) => kind === 'focused') || chosen.length === 0 ? { kind: 'focused' } : { kind: 'kinds', kinds: chosen };
}

export { parseCompactTarget as targetOf };

export const targetSetting = (raw: Text | undefined): Text => ((target) => textOf(target.kind === 'kinds' ? target.kinds.join(',') : target.kind))(parseCompactTarget(raw));

export function hintOf(raw: Text | undefined): Count | null {
    const word = (raw ?? '').trim().toLowerCase();
    const percent = Number(word.replace(/%$/, ''));
    if (word === 'off') return null;
    return countOf(word !== '' && Number.isInteger(percent) && percent >= HINT_MIN && percent <= HINT_MAX ? percent : HINT_DEFAULT);
}

export const hintSetting = (raw: Text | undefined): Text => textOf(String(hintOf(raw) ?? 'off'));

export const windowOf = (raw: Text | undefined): Count | null => {
    const tokens = Number((raw ?? '').replaceAll(/[_,\s]/g, ''));
    return Number.isInteger(tokens) && tokens >= 1000 ? countOf(tokens) : null;
};

export const windowSetting = (raw: Text | undefined): Text => textOf(String(windowOf(raw) ?? ''));

export interface ContextUse { readonly tokens: Count; readonly window: Count; readonly source: WindowSource; }

export interface ContextObserved { readonly tokens: Count; readonly peak: Count; readonly window: Count | null; readonly model: Text | null; }

export interface WindowBasis { readonly window: Count; readonly source: WindowSource; readonly sizes: readonly Count[]; }

export interface ContextFound { readonly observed: ContextObserved; readonly setting: Count | null; }

export type { ContextObserved as Observed };

const raised = (basis: WindowBasis, seen: Count): Count => (seen <= basis.window ? basis.window : (basis.sizes.find((size) => size >= seen) ?? seen));

export function contextOf(found: ContextFound, resolveWindow: WindowOf): ContextUse | null {
    const { observed, setting } = found;
    if (setting !== null) return { tokens: observed.tokens, window: setting, source: 'setting' };
    const base = resolveWindow(observed);
    if (base === null) return null;
    const window = raised(base, countOf(Math.max(observed.tokens, observed.peak)));
    return { tokens: observed.tokens, window, source: window === base.window ? base.source : 'observed' };
}

export const shareOf = (use: ContextUse): Count => countOf(Math.round((100 * use.tokens) / use.window));

export const sizeOf = (window: Count): Text => textOf(window >= 1_000_000 ? `${Number((window / 1_000_000).toFixed(1))}M` : `${Math.round(window / 1000)}k`);

export function tokensOf(count: Count): Text {
    if (count >= 1_000_000) return textOf(`${Number((count / 1_000_000).toFixed(1))}M`);
    return textOf(count >= 1000 ? `${Number((count / 1000).toFixed(1))}k` : String(count));
}

export const hintFor = (use: ContextUse | null | undefined, threshold: Count | null): Count | null =>
    use === null || use === undefined || threshold === null || use.window <= 0 || use.tokens * 100 < threshold * use.window ? null : shareOf(use);
