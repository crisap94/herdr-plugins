import { noticing } from '../harness/confinement-notice.ts';
import { LIBRARY_IDS, LibraryHarness } from '../harness/library.ts';
import type { HarnessRuntime } from '../harness/library.ts';
import type { Row } from '../transcripts/jsonl.ts';
import type { Harness, HarnessSettings } from '#src/ports/harness.ts';
import { isUnknown, saying } from '#src/ports/unknowable.ts';
import { retriedBy } from '#src/experiment/pool.ts';
import { must } from '#src/protocol/result.ts';
import { parseCount, type Count } from '#src/recap/domain/count.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';

export const LABELLER: HarnessSettings = { model: 'gpt-6.1-sol', effort: 'high' };
const TIMEOUT_MS = 15 * 60_000;

export interface Labelled<T> {
    readonly answer: T | null;
    readonly ms: number;
    readonly attempts: Count;
    readonly why: Text | null;
}

export class Labeller {
    private readonly free: Harness[];
    private readonly waiting: ((harness: Harness) => void)[] = [];
    private readonly log: (line: Text) => void;
    readonly settings: HarnessSettings;

    constructor(runtime: HarnessRuntime, slots: number, log: (line: Text) => void, settings: HarnessSettings = LABELLER, make: () => Harness = (): Harness => noticing(new LibraryHarness(runtime, LIBRARY_IDS.codex, TIMEOUT_MS), log)) {
        this.free = Array.from({ length: slots }, () => make());
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

    async ask<T>(instructions: Text, input: Row, parse: (reply: Text) => T | null, name: Text): Promise<Labelled<T>> {
        const harness = await this.take();
        const began = Date.now();
        let attempts = 0;
        let why: Text | null = null;
        try {
            const answer = await retriedBy(async () => {
                attempts += 1;
                const ran = await harness.run({ instructions, input: JSON.stringify(input) }, this.settings);
                if (isUnknown(ran)) { why = must(parseText(saying(ran.why).slice(0, 160))); return null; }
                const parsed = parse(must(parseText(ran.text)));
                why = parsed === null ? must(parseText('the reply did not parse')) : null;
                return parsed;
            }, (parsed) => (parsed !== null ? 'usable' : 'unusable'), {
                onRetry: (n, wait) => { this.log(must(parseText(`${name}: attempt ${n} gave nothing (${why ?? '?'}); waiting ${Math.round(wait / 1000)} s`))); },
            });
            return { answer, ms: Date.now() - began, attempts: must(parseCount(attempts)), why: answer === null ? why : null };
        } finally {
            this.give(harness);
        }
    }
}
