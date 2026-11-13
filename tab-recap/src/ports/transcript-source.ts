export const SCREEN_PREFIX = 'screen:';
export const isScreenSource = (transcript: string): boolean => transcript.startsWith(SCREEN_PREFIX);
