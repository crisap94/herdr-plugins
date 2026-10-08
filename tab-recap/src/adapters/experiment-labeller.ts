// The labeller of EXP-002: Codex through the plugin's own harness, one slot per concurrent call (each with its own work folder).
import { join } from 'node:path';
import { CodexHarness } from './codex-harness.ts';
import type { Harness, HarnessSettings } from '#src/ports/harness.ts';
import { isUnknown, saying } from '#src/ports/unknowable.ts';
import { retried } from '#src/experiment/pool.ts';

export const LABELLER: HarnessSettings = { model: 'gpt-6.1-sol', effort: 'high' };
const TIMEOUT_MS = 15 * 60_000;

export interface Labelled<T> {
    readonly answer: T | null;
    readonly ms: number;
    readonly attempts: number;
    /** why the last attempt gave nothing, when it did not */
    readonly why: string | null;
}

export class Labeller {
    private readonly free: Harness[];
    private readonly waiting: ((harness: Harness) => void)[] = [];
    private readonly log: (line: string) => void;
    readonly settings: HarnessSettings;

    constructor(workDir: string, slots: number, log: (line: string) => void, settings: HarnessSettings = LABELLER, make: (dir: string) => Harness = (dir): Harness => new CodexHarness(dir, TIMEOUT_MS)) {
        this.free = Array.from({ length: slots }, (_, n) => make(join(workDir, `slot-${n}`)));
        this.log = log;
        this.settings = settings;
    }

    private take(): Promise<Harness> {
        const harness = this.free.pop();
        return harness === undefined ? new Promise<Harness>((resolve) => { this.waiting.push(resolve); }) : Promise.resolve(harness);
    }

    private give(harness: Harness): void {
        const next = this.waiting.shift();
        if (next === undefined) this.free.push(harness); else next(harness);
    }

    /** One labelling call: instructions and input to the model, the reply through `parse`. A reply that does not parse, or a failed call, is tried again with a growing wait. */
    async ask<T>(instructions: string, input: object, parse: (reply: string) => T | null, name: string): Promise<Labelled<T>> {
        const harness = await this.take();
        const began = Date.now();
        let attempts = 0;
        let why: string | null = null;
        try {
            const answer = await retried(async () => {
                attempts += 1;
                const ran = await harness.run({ instructions, input: JSON.stringify(input) }, this.settings);
                if (isUnknown(ran)) { why = saying(ran.why).slice(0, 160); return null; }
                const parsed = parse(ran.text);
                why = parsed === null ? 'the reply did not parse' : null;
                return parsed;
            }, (parsed) => parsed !== null, { onRetry: (n, wait) => { this.log(`${name}: attempt ${n} gave nothing (${why ?? '?'}); waiting ${Math.round(wait / 1000)} s`); } });
            return { answer, ms: Date.now() - began, attempts, why: answer === null ? why : null };
        } finally {
            this.give(harness);
        }
    }
}
