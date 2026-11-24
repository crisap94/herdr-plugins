import { must } from '#src/protocol/result.ts';
import { parseCount, type Count } from '#src/recap/domain/count.ts';
import { duration, type Duration, type Instant, type Milliseconds } from '#src/recap/domain/time.ts';
import { observe } from '#src/recap/domain/fold.ts';
import type { Observation } from '#src/recap/domain/fold.ts';
import { emptyBoard, watchSet } from '#src/recap/domain/board.ts';
import type { Board } from '#src/recap/domain/board.ts';
import { uncheckedMilliseconds, uncheckedTokenName, uncheckedTokenValue, type SessionKey } from '#src/recap/domain/ids.ts';
import type { Presence } from '#src/recap/domain/presence.ts';
import type { Intent } from '#src/recap/domain/intent.ts';
import type { Policy } from '#src/recap/domain/policy.ts';
import type { Clock } from '#src/ports/clock.ts';
import type { FleetFeed, FleetFrames, FleetPaneTokens, FleetSnapshot, FleetSnapshotResult } from '#src/ports/fleet-source.ts';
import type { SessionOf } from '#src/ports/session-identity.ts';
import { isUnknown, saying } from '#src/ports/unknowable.ts';
import { AsyncQueue } from './async-queue.ts';
import { dataOf, decode, paneSessionRefOf, paneTokenMapOf, type JsonObject } from './decode.ts';
import { specsFor } from './watch-set.ts';
import { textOf, type Text } from '#src/recap/domain/text.ts';

interface PaneTokens {
    readonly kind: 'tokens';
    readonly pane: SessionKey;
    readonly tokens: FleetPaneTokens;
}

type Step = Observation | PaneTokens;

export interface Blindness {
    readonly at: 'snapshot' | 'subscribe';
    readonly saying: Text;
}

export interface InformerHooks {
    onIntents(intents: readonly Intent[]): Promise<void>;
    onBlind(blindness: Blindness): void;
    onUnknownKind(rawKind: Text): void;
    onBeat(): void;
    onStatus?(pane: SessionKey, status: Text): void;
    onPaneTokens?(pane: SessionKey, tokens: FleetPaneTokens): void;
    sessionIdentity: SessionOf;
}

const RESYNC_DEBOUNCE_MS = 400;

export interface Retry {
    readonly retryBaseMs: Milliseconds;
    readonly retryMaxMs: Milliseconds;
    readonly resyncDebounceMs?: Milliseconds;
    readonly watchdogMs?: Milliseconds;
}

const DEFAULT_RETRY: Retry = { retryBaseMs: uncheckedMilliseconds(1000), retryMaxMs: uncheckedMilliseconds(60_000) };
const WATCHDOG_MS = 300_000;

export const RESUBSCRIBE_EVERY = 10;

export class Informer {
    private readonly source: FleetFeed;
    private readonly clock: Clock;
    private readonly policy: Policy;
    private readonly hooks: InformerHooks;
    private readonly identityForSession: SessionOf;
    private readonly queue = new AsyncQueue<Step>();
    private board: Board = emptyBoard();
    private stream: FleetFrames | null = null;
    private pendingResync: ReturnType<typeof setTimeout> | null = null;
    private pendingRetry: ReturnType<typeof setTimeout> | null = null;
    private failures: Count = must(parseCount(0));
    private ticks: Count = must(parseCount(0));
    private lastLife: Instant;
    private readonly retry: Retry;

    constructor(source: FleetFeed, clock: Clock, policy: Policy, hooks: InformerHooks, retry: Retry = DEFAULT_RETRY) {
        this.retry = retry;
        this.lastLife = clock.now();
        this.source = source;
        this.clock = clock;
        this.policy = policy;
        this.hooks = hooks;
        this.identityForSession = hooks.sessionIdentity;
    }

    get current(): Board {
        return this.board;
    }

    get listening(): Presence {
        return this.stream === null ? 'absent' : 'present';
    }

    private async stamped(): Promise<FleetSnapshotResult> {
        const requested = this.clock.now();
        const snap = await this.source.snapshot();
        if (isUnknown(snap)) {
            return snap;
        }
        this.lastLife = this.clock.now();
        return { ...snap, seen: { ...snap.seen, at: requested } };
    }

    private pushSnapshot(snap: FleetSnapshot): void {
        this.queue.push({ kind: 'reconciled', seen: snap.seen });
        for (const [pane, tokens] of snap.paneTokens) {
            this.queue.push({ kind: 'tokens', pane, tokens });
        }
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
        this.failures = must(parseCount(0));
        this.retire();
        this.stream = opened.stream;
        void this.pump(opened.stream);
        const first = !this.board.seeded;
        this.pushSnapshot(snap);
        if (first && snap.focusedTab !== null) {
            this.queue.push({ kind: 'focused', tab: snap.focusedTab });
        }
    }

    private async recoverWithoutStream(): Promise<void> {
        const snap = await this.stamped();
        if (!isUnknown(snap)) {
            this.pushSnapshot(snap);
        }
        this.retrySoon();
    }

    private retrySoon(): void {
        if (this.pendingRetry !== null) {
            return;
        }
        const delay = Math.min(this.retry.retryMaxMs, this.retry.retryBaseMs * 2 ** this.failures);
        this.failures = must(parseCount(this.failures + 1));
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
        this.pushSnapshot(snap);
    }

    tick(): void {
        this.ticks = must(parseCount(this.ticks + 1));
        if (this.silentFor() > (this.retry.watchdogMs ?? WATCHDOG_MS)) {
            this.hooks.onBlind({ at: 'subscribe', saying: textOf(`no frame and no snapshot from herdr for ${Math.round(this.silentFor() / 60_000)} min: subscribing afresh`) });
            this.lastLife = this.clock.now();
            void this.enterSubscription();
        } else if (this.ticks % RESUBSCRIBE_EVERY === 0) {
            void this.enterSubscription();
        } else {
            this.resync();
        }
    }

    private silentFor(): Duration {
        return duration(this.clock.now() - this.lastLife);
    }

    private retire(): void {
        this.stream?.close();
        this.stream = null;
    }

    private async pump(stream: FleetFrames): Promise<void> {
        for await (const frame of stream.frames()) {
            this.lastLife = this.clock.now();
            if (frame.event.replaceAll('.', '_') === 'pane_updated') {
                this.paneUpdated(dataOf(frame));
                continue;
            }
            const decoded = decode(frame, this.identityForSession);
            if (decoded.kind === 'unknown') {
                this.hooks.onUnknownKind(decoded.rawKind);
            } else if (decoded.kind === 'resync') {
                this.resync();
            } else {
                if (decoded.kind === 'status') {
                    this.hooks.onStatus?.(decoded.pane, decoded.status);
                }
                this.queue.push(decoded);
            }
        }
        if (this.stream === stream) {
            this.hooks.onBlind({ at: 'subscribe', saying: textOf('the subscription ended') });
            this.stream = null;
            this.resync();
        }
    }

    private paneUpdated(data: JsonObject): void {
        const tokens = paneTokenMapOf(data);
        if (tokens !== null) {
            this.queue.push({ kind: 'tokens', pane: tokens.pane, tokens: new Map([...tokens.tokens].map(([name, value]) => [uncheckedTokenName(name), uncheckedTokenValue(value)])) });
        }
        const session = paneSessionRefOf(data, this.identityForSession);
        if (session !== null) {
            this.push({ kind: 'session', pane: session.pane, session: textOf(session.session) });
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
        for await (const step of this.queue) {
            if (step.kind === 'tokens') {
                this.hooks.onPaneTokens?.(step.pane, step.tokens);
                continue;
            }
            const outcome = observe(this.board, step, this.clock.now(), this.policy);
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
