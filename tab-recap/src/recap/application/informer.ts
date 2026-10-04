import { observe } from '#src/recap/domain/fold.ts';
import type { Observation } from '#src/recap/domain/fold.ts';
import { emptyBoard, watchSet } from '#src/recap/domain/board.ts';
import type { Board } from '#src/recap/domain/board.ts';
import { tabId } from '#src/recap/domain/ids.ts';
import type { Intent } from '#src/recap/domain/intent.ts';
import type { Policy } from '#src/recap/domain/policy.ts';
import type { Clock } from '#src/ports/clock.ts';
import type { FleetSource, FrameStream } from '#src/ports/fleet-source.ts';
import { isUnknown, saying } from '#src/ports/unknowable.ts';
import { AsyncQueue } from './async-queue.ts';
import { decode } from './decode.ts';
import { specsFor } from './watch-set.ts';

export interface Blindness {
    readonly at: 'snapshot' | 'subscribe';
    readonly saying: string;
}

export interface InformerHooks {
    onIntents(intents: readonly Intent[]): Promise<void>;
    onBlind(blindness: Blindness): void;
    onUnknownKind(rawKind: string): void;
    onBeat(): void;
}

const RESYNC_DEBOUNCE_MS = 400;

/** Holds the board; feeds the fold; keeps the watch set in step with the lanes. */
export class Informer {
    private readonly source: FleetSource;
    private readonly clock: Clock;
    private readonly policy: Policy;
    private readonly hooks: InformerHooks;
    private readonly queue = new AsyncQueue<Observation>();
    private board: Board = emptyBoard();
    private stream: FrameStream | null = null;
    private pendingResync: ReturnType<typeof setTimeout> | null = null;

    constructor(source: FleetSource, clock: Clock, policy: Policy, hooks: InformerHooks) {
        this.source = source;
        this.clock = clock;
        this.policy = policy;
        this.hooks = hooks;
    }

    get current(): Board {
        return this.board;
    }

    /** Subscribe FIRST, snapshot SECOND: a change between the two is then not lost. */
    async enterSubscription(): Promise<void> {
        const opened = await this.source.subscribe(specsFor(watchSet(this.board)));
        if (isUnknown(opened)) {
            this.hooks.onBlind({ at: 'subscribe', saying: saying(opened.why) });
            return;
        }
        const snap = await this.source.snapshot();
        if (isUnknown(snap)) {
            opened.stream.close();
            this.hooks.onBlind({ at: 'snapshot', saying: saying(snap.why) });
            return;
        }
        this.retire();
        this.stream = opened.stream;
        void this.pump(opened.stream);
        const first = !this.board.seeded;
        this.queue.push({ kind: 'reconciled', seen: snap.seen });
        if (first && snap.focusedTab !== null) {
            this.queue.push({ kind: 'focused', tab: tabId(snap.focusedTab) });
        }
    }

    private retire(): void {
        this.stream?.close();
        this.stream = null;
    }

    private async pump(stream: FrameStream): Promise<void> {
        for await (const frame of stream.frames()) {
            const decoded = decode(frame);
            if (decoded.kind === 'unknown') {
                this.hooks.onUnknownKind(decoded.rawKind);
            } else if (decoded.kind === 'resync') {
                this.resync();
            } else {
                this.queue.push(decoded);
            }
        }
        if (this.stream === stream) {
            this.hooks.onBlind({ at: 'subscribe', saying: 'the subscription ended' });
            this.stream = null;
            this.resync();
        }
    }

    push(observation: Observation): void {
        this.queue.push(observation);
    }

    resync(): void {
        if (this.pendingResync !== null) {
            return;
        }
        this.pendingResync = setTimeout(() => {
            this.pendingResync = null;
            void this.enterSubscription();
        }, RESYNC_DEBOUNCE_MS);
    }

    async run(): Promise<void> {
        for await (const observation of this.queue) {
            const outcome = observe(this.board, observation, this.clock.now(), this.policy);
            this.board = outcome.board;
            if (outcome.intents.length > 0) {
                await this.hooks.onIntents(outcome.intents);
            }
            if (outcome.watchSet === 'changed') {
                await this.enterSubscription();
            }
            this.hooks.onBeat();
        }
    }

    stop(): void {
        this.retire();
        this.queue.end();
    }
}
