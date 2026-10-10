import { REGISTERED_KINDS, kindsWith } from './registered-kinds.ts';
import type { RegisteredKindTable } from './registered-kinds.ts';

export function compactableKinds<T extends RegisteredKindTable>(table: T): readonly (keyof T)[] {
    return kindsWith(table, 'compactable');
}

export const COMPACTABLE = compactableKinds(REGISTERED_KINDS);

export type CompactTarget = { readonly kind: 'focused' } | { readonly kind: 'all' } | { readonly kind: 'kinds'; readonly kinds: readonly string[] };

export const HINT_DEFAULT = 40;
export const HINT_MIN = 10;
export const HINT_MAX = 95;

const list = (raw: string | undefined): readonly string[] => [...new Set((raw ?? '').split(/[\s,]+/).map((word) => word.toLowerCase()).filter((word) => word !== ''))];

export function targetOf(raw: string | undefined): CompactTarget {
    const kinds = list(raw);
    if (kinds.includes('all')) {
        return { kind: 'all' };
    }
    const named = kinds.filter((kind) => kind !== 'focused');
    return kinds.includes('focused') || named.length === 0 ? { kind: 'focused' } : { kind: 'kinds', kinds: named };
}

export function targetSetting(raw: string | undefined): string {
    const target = targetOf(raw);
    return target.kind === 'kinds' ? target.kinds.join(',') : target.kind;
}

export function hintOf(raw: string | undefined): number | null {
    const word = (raw ?? '').trim().toLowerCase();
    const percent = Number(word.replace(/%$/, ''));
    if (word === 'off') {
        return null;
    }
    return word !== '' && Number.isInteger(percent) && percent >= HINT_MIN && percent <= HINT_MAX ? percent : HINT_DEFAULT;
}

export const hintSetting = (raw: string | undefined): string => String(hintOf(raw) ?? 'off');

export function windowOf(raw: string | undefined): number | null {
    const tokens = Number((raw ?? '').replaceAll(/[_,\s]/g, ''));
    return Number.isInteger(tokens) && tokens >= 1000 ? tokens : null;
}

export const windowSetting = (raw: string | undefined): string => String(windowOf(raw) ?? '');

export type WindowSource = 'agent' | 'catalogue' | 'table' | 'observed' | 'setting';

export interface ContextUse {
    readonly tokens: number;
    readonly window: number;
    readonly source: WindowSource;
}

export interface Observed {
    readonly tokens: number;
    readonly peak: number;
    readonly window: number | null;
    readonly model: string | null;
}

const SIZES: readonly number[] = [200_000, 1_000_000];

export function familyWindow(model: string): number {
    const id = model.toLowerCase();
    if (id.includes('[1m]')) {
        return 1_000_000;
    }
    const version = /(?:opus|sonnet)-(\d+)(?:[-.](\d{1,2})(?!\d))?/.exec(id);
    if (version === null) {
        return 200_000;
    }
    const [major, minor] = [Number(version[1]), Number(version[2] ?? 0)];
    return major > 4 || (major === 4 && minor >= 6) ? 1_000_000 : 200_000;
}

function raised(window: number, seen: number): number {
    return seen <= window ? window : (SIZES.find((size) => size >= seen) ?? seen);
}

function baseWindow(found: { readonly observed: Observed; readonly agent: string; readonly catalogued: number | null }): { readonly window: number; readonly source: WindowSource } | null {
    const { observed, agent, catalogued } = found;
    if (observed.window !== null) {
        return { window: observed.window, source: 'agent' };
    }
    if (catalogued !== null) {
        return { window: catalogued, source: 'catalogue' };
    }
    return agent === 'claude' ? { window: familyWindow(observed.model ?? ''), source: 'table' } : null;
}

export function contextOf(found: { readonly observed: Observed; readonly agent: string; readonly setting: number | null; readonly catalogued: number | null }): ContextUse | null {
    const { observed, setting } = found;
    if (setting !== null) {
        return { tokens: observed.tokens, window: setting, source: 'setting' };
    }
    const base = baseWindow(found);
    if (base === null) {
        return null;
    }
    const window = raised(base.window, Math.max(observed.tokens, observed.peak));
    return { tokens: observed.tokens, window, source: window === base.window ? base.source : 'observed' };
}

export const shareOf = (use: ContextUse): number => Math.round((100 * use.tokens) / use.window);

export const sizeOf = (window: number): string => (window >= 1_000_000 ? `${Number((window / 1_000_000).toFixed(1))}M` : `${Math.round(window / 1000)}k`);

export function tokensOf(count: number): string {
    if (count >= 1_000_000) {
        return `${Number((count / 1_000_000).toFixed(1))}M`;
    }
    return count >= 1000 ? `${Number((count / 1000).toFixed(1))}k` : String(count);
}

export const hintFor = (use: ContextUse | null | undefined, threshold: number | null): number | null => {
    if (use === null || use === undefined || threshold === null || use.window <= 0) {
        return null;
    }
    return use.tokens * 100 >= threshold * use.window ? shareOf(use) : null;
};
