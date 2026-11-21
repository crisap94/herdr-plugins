export type HookHarness = keyof typeof HOOK_EVENTS;
export type HookKind = 'stop' | 'session-start' | 'pre-compact' | 'other';
export type HookSource = 'startup' | 'resume' | 'clear' | 'compact' | 'fork';
export interface HookCall {
    readonly harness: HookHarness;
    readonly kind: HookKind;
    readonly native: string;
    readonly session: string | null;
    readonly source: HookSource | null;
    readonly cwd: string | null;
}
export type HookAnswer = { readonly kind: 'nothing' } | { readonly kind: 'context'; readonly text: string };
export type PreCompactTrigger = 'manual' | 'auto';
export const PRE_COMPACT_HOLD_REASON = 'tab-recap compacts this lane itself when it is idle';

export type PreCompactAnswer = { readonly kind: 'nothing' } | { readonly kind: 'hold'; readonly reason: typeof PRE_COMPACT_HOLD_REASON };
export interface HookReceiver {
    handle(call: HookCall): HookAnswer;
}
export const HOOK_EVENTS: {
    readonly claude: readonly ['Stop', 'SessionStart', 'PreCompact'];
    readonly codex: readonly ['Stop', 'SessionStart', 'PreCompact'];
} = {
    claude: ['Stop', 'SessionStart', 'PreCompact'],
    codex: ['Stop', 'SessionStart', 'PreCompact'],
};
export const PRE_COMPACT_CLAUDE_PATH = '/pre-compact/claude';
export const HOOK_LIMITS: { readonly bodyBytes: 1_048_576; readonly layerMs: 1500; readonly shimMs: 5000 } = {
    bodyBytes: 1_048_576,
    layerMs: 1500,
    shimMs: 5000,
};
