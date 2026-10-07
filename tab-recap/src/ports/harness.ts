import type { Effort } from '#src/recap/domain/effort.ts';
import type { Unknown } from './unknowable.ts';

/** What a model is asked: the rules (`instructions`) and the data they apply to (`input`). */
export interface HarnessCall {
    readonly instructions: string;
    readonly input: string;
}

/** What a job chose: the model (empty = the harness's own default) and how hard it thinks. */
export interface HarnessSettings {
    readonly model: string;
    readonly effort: Effort;
}

export type Ran = { readonly kind: 'ran'; readonly text: string; readonly costUsd: number } | Unknown;

/**
 * A coding-agent CLI used as a plain text-in, text-out model: no tools, no user settings, no session left behind.
 * Every model call of the plugin (the recap writer, the compaction brief) is a job on one of these.
 */
export interface Harness {
    /** `claude`, `codex`, `opencode`, `hermes` or `custom` */
    readonly id: string;
    /** what a call with `settings` is called in the logs and the recap's footer: `claude/sonnet` */
    label(settings: HarnessSettings): string;
    /** the most bytes of instructions plus input it can be given (an argument, not stdin); null: no limit */
    readonly limit: number | null;
    run(call: HarnessCall, settings: HarnessSettings): Promise<Ran>;
}
