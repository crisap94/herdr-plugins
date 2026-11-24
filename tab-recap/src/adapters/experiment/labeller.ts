import { noticing } from '../harness/confinement-notice.ts';
import { LIBRARY_IDS, LibraryHarnessPort } from '../harness/library.ts';
import type { HarnessRuntime } from '../harness/library.ts';
import type { Row } from '../transcripts/jsonl.ts';
import type { HarnessChoice, HarnessPort } from '#src/ports/harness.ts';
import { isUnknown, saying } from '@stateforge-labs/session-ledger';
import { retriedBy } from '#src/experiment/pool.ts';
import { must } from '@stateforge-labs/session-ledger';
import { parseCount, type Count } from '@stateforge-labs/session-ledger';
import { duration, type Duration } from '@stateforge-labs/session-ledger';
import { uncheckedMilliseconds } from '#src/recap/domain/ids.ts';
import { parseText, textOf, type Text } from '@stateforge-labs/session-ledger';

export const LABELLER: HarnessChoice = { model: textOf('gpt-6.1-sol'), effort: 'high' };
const TIMEOUT_MS = uncheckedMilliseconds(15 * 60_000);

export interface Labelled<T> {
    readonly answer: T | null;
    readonly ms: Duration;
    readonly attempts: Count;
    readonly why: Text | null;
}

export class Labeller {
    private readonly free: HarnessPort[];
    private readonly waiting: ((harness: HarnessPort) => void)[] = [];
    private readonly log: (line: Text) => void;
    readonly settings: HarnessChoice;

    constructor(runtime: HarnessRuntime, slots: Count, log: (line: Text) => void, settings: HarnessChoice = LABELLER, make: () => HarnessPort = (): HarnessPort => noticing(new LibraryHarnessPort(runtime, LIBRARY_IDS.codex, TIMEOUT_MS), log)) {
        this.free = Array.from({ length: slots }, () => make());
        this.log = log;
        this.settings = settings;
    }

    private take(): Promise<HarnessPort> {
        const harness = this.free.pop();
        return harness === undefined ? new Promise<HarnessPort>((resolve) => { this.waiting.push(resolve); }) : Promise.resolve(harness);
    }

    private give(harness: HarnessPort): void {
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
                const ran = await harness.run({ instructions, input: textOf(JSON.stringify(input)) }, this.settings);
                if (isUnknown(ran)) { why = must(parseText(saying(ran.why).slice(0, 160))); return null; }
                const parsed = parse(ran.text);
                why = parsed === null ? must(parseText('the reply did not parse')) : null;
                return parsed;
            }, (parsed) => (parsed !== null ? 'usable' : 'unusable'), {
                onRetry: (n, wait) => { this.log(must(parseText(`${name}: attempt ${n} gave nothing (${why ?? '?'}); waiting ${Math.round(wait / 1000)} s`))); },
            });
            return { answer, ms: duration(Date.now() - began), attempts: must(parseCount(attempts)), why: answer === null ? why : null };
        } finally {
            this.give(harness);
        }
    }
}
