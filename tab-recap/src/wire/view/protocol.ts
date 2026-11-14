export const PROTOCOL = 1;
export type Role = 'column' | 'modal' | 'bar';
export interface StatusTexts { readonly connecting: string; readonly down: string; readonly downHint: string; readonly mismatch: string }
export const DEFAULT_TEXTS: StatusTexts = {
    connecting: 'Connecting to the recap daemon…',
    down: 'The recap daemon is not running.',
    downHint: 'It starts again with the next herdr session.',
    mismatch: 'This pane and the recap daemon speak different protocols.',
};
export const LIMITS: { readonly lineBytes: 1_048_576 } = { lineBytes: 1_048_576 };
export const TIMING: { readonly welcomeMs: 2000; readonly pingEveryMs: 10_000; readonly pongMs: 5000; readonly backoffMs: readonly [100, 200, 400, 800, 1600, 3200, 5000]; readonly downAfterMs: 3000; readonly mismatchRetryMs: 30_000 } = {
    welcomeMs: 2000,
    pingEveryMs: 10_000,
    pongMs: 5000,
    backoffMs: [100, 200, 400, 800, 1600, 3200, 5000],
    downAfterMs: 3000,
    mismatchRetryMs: 30_000,
};
export interface Hello { readonly t: 'hello'; readonly protocol: number; readonly version: string; readonly role: Role; readonly tab: string; readonly pane: string | null; readonly cols: number; readonly rows: number; readonly colour: boolean }
export interface Resize { readonly t: 'resize'; readonly cols: number; readonly rows: number }
export interface Key { readonly t: 'key'; readonly key: string }
export interface Tap { readonly t: 'tap'; readonly col: number; readonly row: number }
export interface IntentMessage { readonly t: 'intent'; readonly intent: 'refresh' | 'hide' | 'show-modal' | 'compact' | 'configure' }
export interface Ping { readonly t: 'ping' }
export type ClientMessage = Hello | Resize | Key | Tap | IntentMessage | Ping;
export interface Welcome { readonly t: 'welcome'; readonly protocol: number; readonly version: string; readonly title: string; readonly texts: StatusTexts }
export interface FrameMessage { readonly t: 'frame'; readonly lines: readonly string[] }
export interface Pong { readonly t: 'pong' }
export interface Bye { readonly t: 'bye'; readonly why: 'shutdown' | 'protocol' | 'malformed' | 'closed'; readonly protocol: number; readonly version: string }
export type DaemonMessage = Welcome | FrameMessage | Pong | Bye;
