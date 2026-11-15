import type { Unknown } from './unknowable.ts';

export { SCREEN_PREFIX, isScreenSource } from './transcript-source.ts';

export type ScreenResult =
    | { readonly kind: 'screen'; readonly text: string; readonly revision: number; readonly truncated: boolean }
    | Unknown;

export interface Screens {
    readScreen(pane: string, lines: number): Promise<ScreenResult>;
}
