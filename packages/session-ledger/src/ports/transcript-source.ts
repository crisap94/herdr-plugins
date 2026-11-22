import type { SourcePath } from './transcripts.ts';

export const SCREEN_PREFIX = 'screen:';

export type ScreenSource = SourcePath & { readonly screen: true };

export const isScreenSource = (transcript: SourcePath): transcript is ScreenSource => transcript.startsWith(SCREEN_PREFIX);
