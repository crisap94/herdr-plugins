import type { Unknown } from './unknowable.ts';

/** A lane read from its screen has a transcript named `screen:<pane>`. */
export const SCREEN_PREFIX = 'screen:';
export const isScreenSource = (transcript: string): boolean => transcript.startsWith(SCREEN_PREFIX);

export type ScreenResult =
    | { readonly kind: 'screen'; readonly text: string; readonly revision: number; readonly truncated: boolean }
    | Unknown;

/** What a pane's terminal shows. Read-only: asking never types into the pane. */
export interface Screens {
    readScreen(pane: string, lines: number): Promise<ScreenResult>;
}
