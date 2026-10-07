// What compaction is configured as, and how full a lane's context is. Pure.

/** The kinds that can be compacted: the ones with a `/compact` we know. */
export const COMPACTABLE: readonly string[] = ['claude', 'codex', 'opencode'];

export type CompactTarget = { readonly kind: 'focused' } | { readonly kind: 'all' } | { readonly kind: 'kinds'; readonly kinds: readonly string[] };

export const HINT_DEFAULT = 40;
export const HINT_MIN = 10;
export const HINT_MAX = 95;

const list = (raw: string | undefined): readonly string[] => [...new Set((raw ?? '').split(/[\s,]+/).map((word) => word.toLowerCase()).filter((word) => word !== ''))];

/** `TAB_RECAP_COMPACT_TARGET`: `focused` (default), `all`, or agent kinds. */
export function targetOf(raw: string | undefined): CompactTarget {
    const kinds = list(raw);
    if (kinds.includes('all')) {
        return { kind: 'all' };
    }
    const named = kinds.filter((kind) => kind !== 'focused');
    return kinds.includes('focused') || named.length === 0 ? { kind: 'focused' } : { kind: 'kinds', kinds: named };
}

/** The setting as it is stored: `focused`, `all` or a comma list. */
export function targetSetting(raw: string | undefined): string {
    const target = targetOf(raw);
    return target.kind === 'kinds' ? target.kinds.join(',') : target.kind;
}

/** `TAB_RECAP_COMPACT_HINT`: the share (10–95) of the window at which a lane shows the hint; `off` shows none; anything else is the default. */
export function hintOf(raw: string | undefined): number | null {
    const word = (raw ?? '').trim().toLowerCase();
    const percent = Number(word.replace(/%$/, ''));
    if (word === 'off') {
        return null;
    }
    return word !== '' && Number.isInteger(percent) && percent >= HINT_MIN && percent <= HINT_MAX ? percent : HINT_DEFAULT;
}

export const hintSetting = (raw: string | undefined): string => String(hintOf(raw) ?? 'off');

/** `TAB_RECAP_CONTEXT_WINDOW`: tokens an agent can hold, overriding what is found at runtime; null (empty or nonsense) = detect. */
export function windowOf(raw: string | undefined): number | null {
    const tokens = Number((raw ?? '').replaceAll(/[_,\s]/g, ''));
    return Number.isInteger(tokens) && tokens >= 1000 ? tokens : null;
}

/** The setting as it is stored: a number, or empty for runtime detection. */
export const windowSetting = (raw: string | undefined): string => String(windowOf(raw) ?? '');

/** Where a window came from: the agent itself, a model catalogue, the built-in table, the tokens seen, or the operator's setting. */
export type WindowSource = 'agent' | 'catalogue' | 'table' | 'observed' | 'setting';

/** How much of its window an agent's conversation takes. */
export interface ContextUse {
    readonly tokens: number;
    readonly window: number;
    readonly source: WindowSource;
}

/** What a reader found in an agent's own records: tokens in use now, the most ever seen (before a compaction), the window it states, the model. */
export interface Observed {
    readonly tokens: number;
    readonly peak: number;
    readonly window: number | null;
    /** `provider/model` for opencode, the model id for claude */
    readonly model: string | null;
}

/** The sizes a window is raised through when more than it has been seen in use. */
const SIZES: readonly number[] = [200_000, 1_000_000];

/**
 * FALLBACK, used only when the local catalogue does not know the model: Claude's window by family.
 * Haiku 200 000; Opus and Sonnet 4.6 and later 1 000 000; older 200 000. `[1m]` in the id says 1 000 000.
 */
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

/** More than the window has been seen in use: the window was too small a guess; the next known size holds it. */
function raised(window: number, seen: number): number {
    return seen <= window ? window : (SIZES.find((size) => size >= seen) ?? seen);
}

/** Where the window starts from, before what has been seen in use is looked at; null when nothing says. */
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

/**
 * The window to measure against, runtime first: the setting; what the agent states (codex); the local catalogue; for claude the
 * family table; and never less than what has been seen in use. Null when nothing says (an unknown model of an unknown agent).
 */
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

/** The size in words: `200k`, `1M`. */
export const sizeOf = (window: number): string => (window >= 1_000_000 ? `${Number((window / 1_000_000).toFixed(1))}M` : `${Math.round(window / 1000)}k`);

/** A token count in the short form of the hint: `812`, `39.5k`, `100k`, `1M`. */
export function tokensOf(count: number): string {
    if (count >= 1_000_000) {
        return `${Number((count / 1_000_000).toFixed(1))}M`;
    }
    return count >= 1000 ? `${Number((count / 1000).toFixed(1))}k` : String(count);
}

/** The percentage to show beside a lane, or null when it is under the threshold (or the hint is off). */
export const hintFor = (use: ContextUse | null | undefined, threshold: number | null): number | null => {
    if (use === null || use === undefined || threshold === null || use.window <= 0) {
        return null;
    }
    return use.tokens * 100 >= threshold * use.window ? shareOf(use) : null;
};
