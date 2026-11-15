export const MIN_BUN: string;
export function bunAtLeast(version: string, minimum?: string): boolean;

export type Platform = 'macos' | 'linux';
export type StepId =
    | 'brew' | 'mise' | 'curl'
    | 'herdr-stop' | 'new-terminal' | 'launchctl-path';

export interface Refusal {
    readonly ok: false;
    readonly found: string;
    readonly needed: string;
    readonly platform: Platform;
    readonly steps: readonly StepId[];
}
export type Support = { readonly ok: true } | Refusal;

export function supportOf(host: { readonly bunVersion: string; readonly platform: string }): Support;

export interface RefusalWords {
    readonly headline: (found: string, needed: string, path: string) => string;
    readonly fix: string;
    readonly install: (needed: string, options: readonly string[]) => string;
    readonly steps: Readonly<Record<StepId, (needed: string) => string>>;
}
export const ENGLISH: RefusalWords;
export function renderRefusal(refusal: Pick<Refusal, 'found' | 'needed' | 'steps'>, path: string, words?: RefusalWords): string;
