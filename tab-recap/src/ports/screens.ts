import type { Unknown } from './unknowable.ts';

export const SCREEN_PREFIX = 'screen:';
export const isScreenSource = (transcript: string): boolean => transcript.startsWith(SCREEN_PREFIX);

export type ScreenResult =
    | { readonly kind: 'screen'; readonly text: string; readonly revision: number; readonly truncated: boolean }
    | Unknown;

export interface Screens {
    readScreen(pane: string, lines: number): Promise<ScreenResult>;
}
