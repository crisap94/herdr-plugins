import { observe } from '#src/recap/domain/fold.ts';
import type { Observation } from '#src/recap/domain/fold.ts';
import { emptyBoard, watchSet } from '#src/recap/domain/board.ts';
import type { Board } from '#src/recap/domain/board.ts';
import { paneId, tabId } from '#src/recap/domain/ids.ts';
import type { Intent } from '#src/recap/domain/intent.ts';
import type { Policy } from '#src/recap/domain/policy.ts';
import type { Clock } from '#src/ports/clock.ts';
import type { FleetSource, FrameStream, SnapshotResult } from '#src/ports/fleet-source.ts';
import type { SessionIdentity } from '#src/ports/session-identity.ts';
import { sessionFromAgentSession } from '#src/recap/domain/session-identity.ts';
import { isUnknown, saying } from '#src/ports/unknowable.ts';
import { AsyncQueue } from './async-queue.ts';
import { decode, paneSessionOf } from './decode.ts';
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
    onStatus?(pane: string, status: string): void;
    onPaneUpdated?(data: Readonly<Record<string, unknown>>): void;
    sessionIdentity?: SessionIdentity;
}

const RESYNC_DEBOUNCE_MS = 400;

export interface Retry {
    readonly retryBaseMs: number;
    readonly retryMaxMs: number;
    readonly resyncDebounceMs?: number;
    readonly watchdogMs?: number;
}

const DEFAULT_RETRY: Retry = { retryBaseMs: 1000, retryMaxMs: 60_000 };
const WATCHDOG_MS = 300_000;

export const RESUBSCRIBE_EVERY = 10;

export class Informer {
    private readonly source: FleetSource;
    private readonly clock: Clock;
    private readonly policy: Policy;
    private readonly hooks: InformerHooks;
    private readonly sessionIdentity: SessionIdentity;
    private readonly queue = new AsyncQueue<Observation>();
    private board: Board = emptyBoard();
    private stream: FrameStream | null = null;
    private pendingResync: ReturnType<typeof setTimeout> | null = null;
    private pendingRetry: ReturnType<typeof setTimeout> | null = null;
    private failures = 0;
    private ticks = 0;
    private lastLife: number;
    private readonly retry: Retry;

    constructor(source: FleetSource, clock: Clock, policy: Policy, hooks: InformerHooks, retry: Retry = DEFAULT_RETRY) {
        this.retry = retry;
        this.lastLife = Number(clock.now());
        this.source = source;
        this.clock = clock;
        this.policy = policy;
        this.hooks = hooks;
        this.sessionIdentity = hooks.sessionIdentity ?? sessionFromAgentSession;
    }

    get current(): Board {
        return this.board;
    }

    get listening(): boolean {
        return this.stream !== null;
    }

    private async stamped(): Promise<SnapshotResult> {
        const requested = Number(this.clock.now());
        const snap = await this.source.snapshot();
        if (!isUnknown(snap)) {
            this.lastLife = Number(this.clock.now());
        }
        return isUnknown(snap) ? snap : { ...snap, seen: { ...snap.seen, at: requested } };
    }

    async enterSubscription(): Promise<void> {
        const opened = await this.source.subscribe(specsFor(watchSet(this.board)));
        if (isUnknown(opened)) {
            this.hooks.onBlind({ at: 'subscribe', saying: saying(opened.why) });
            await this.recoverWithoutStream();
            return;
        }
        const snap = await this.stamped();
        if (isUnknown(snap)) {
            opened.stream.close();
            this.hooks.onBlind({ at: 'snapshot', saying: saying(snap.why) });
            this.retrySoon();
            return;
        }
        this.failures = 0;
        this.retire();
        this.stream = opened.stream;
        void this.pump(opened.stream);
        const first = !this.board.seeded;
        this.queue.push({ kind: 'reconciled', seen: snap.seen });
        if (first && snap.focusedTab !== null) {
            this.queue.push({ kind: 'focused', tab: tabId(snap.focusedTab) });
        }
    }

    private async recoverWithoutStream(): Promise<void> {
        const snap = await this.stamped();
        if (!isUnknown(snap)) {
            this.queue.push({ kind: 'reconciled', seen: snap.seen });
        }
        this.retrySoon();
    }

    private retrySoon(): void {
        if (this.pendingRetry !== null) {
            return;
        }
        const delay = Math.min(this.retry.retryMaxMs, this.retry.retryBaseMs * 2 ** this.failures);
        this.failures += 1;
        this.pendingRetry = setTimeout(() => {
            this.pendingRetry = null;
            void this.enterSubscription();
        }, delay);
        this.pendingRetry.unref();
    }

    async reconcile(): Promise<void> {
        if (this.stream === null) {
            await this.enterSubscription();
            return;
        }
        const snap = await this.stamped();
        if (isUnknown(snap)) {
            this.hooks.onBlind({ at: 'snapshot', saying: saying(snap.why) });
            return;
        }
        this.queue.push({ kind: 'reconciled', seen: snap.seen });
    }

    tick(): void {
        this.ticks += 1;
        if (this.silentFor() > (this.retry.watchdogMs ?? WATCHDOG_MS)) {
            this.hooks.onBlind({ at: 'subscribe', saying: `no frame and no snapshot from herdr for ${Math.round(this.silentFor() / 60_000)} min: subscribing afresh` });
            this.lastLife = Number(this.clock.now());
            void this.enterSubscription();
        } else if (this.ticks % RESUBSCRIBE_EVERY === 0) {
            void this.enterSubscription();
        } else {
            this.resync();
        }
    }

    private silentFor(): number {
        return Number(this.clock.now()) - this.lastLife;
    }

    private retire(): void {
        this.stream?.close();
        this.stream = null;
    }

    private async pump(stream: FrameStream): Promise<void> {
        for await (const frame of stream.frames()) {
            this.lastLife = Number(this.clock.now());
            if (frame.event.replaceAll('.', '_') === 'pane_updated') {
                this.hooks.onPaneUpdated?.(frame.data);
                const session = paneSessionOf(frame.data, this.sessionIdentity);
                if (session !== null) {
                    this.push({ kind: 'session', pane: paneId(session.pane), session: session.session });
                }
                continue;
            }
            const decoded = decode(frame, this.sessionIdentity);
            if (decoded.kind === 'unknown') {
                this.hooks.onUnknownKind(decoded.rawKind);
            } else if (decoded.kind === 'resync') {
                this.resync();
            } else {
                if (decoded.kind === 'status') {
                    this.hooks.onStatus?.(String(decoded.pane), decoded.status);
                }
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
            void this.reconcile();
        }, this.retry.resyncDebounceMs ?? RESYNC_DEBOUNCE_MS);
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
        if (this.pendingRetry !== null) {
            clearTimeout(this.pendingRetry);
            this.pendingRetry = null;
        }
        this.retire();
        this.queue.end();
    }
}
