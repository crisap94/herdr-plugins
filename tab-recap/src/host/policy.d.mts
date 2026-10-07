export const MIN_NODE: string;
export function nodeAtLeast(version: string, minimum?: string): boolean;

export type Platform = 'macos' | 'linux' | 'windows';
export type StepId =
    | 'brew' | 'mise' | 'nvm' | 'n' | 'winget' | 'nvm-windows'
    | 'herdr-stop' | 'new-terminal' | 'launchctl-path' | 'restart-herdr';

export interface Refusal {
    readonly ok: false;
    readonly found: string;
    readonly needed: string;
    readonly platform: Platform;
    readonly steps: readonly StepId[];
}
export type Support = { readonly ok: true } | Refusal;

export function supportOf(host: { readonly nodeVersion: string; readonly platform: string }): Support;

/** one language's words for the refusal; the catalogs carry their own */
export interface RefusalWords {
    readonly headline: (found: string, needed: string, path: string) => string;
    readonly fix: string;
    readonly install: (needed: string, options: readonly string[]) => string;
    readonly steps: Readonly<Record<StepId, (needed: string) => string>>;
}
export const ENGLISH: RefusalWords;
export function renderRefusal(refusal: Pick<Refusal, 'found' | 'needed' | 'steps'>, path: string, words?: RefusalWords): string;
