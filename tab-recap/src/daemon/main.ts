import { must } from '@stateforge-labs/session-ledger';
import { setTimeout as sleep } from 'node:timers/promises';
import type { BriefRetention } from '@stateforge-labs/session-ledger';
import { daemonTranscriptRegistry } from '#src/adapters/transcripts/registry.ts';
import { sessionOfForKind } from '#src/adapters/herdr/session-registry.ts';
import type { Store } from '#src/adapters/db/database.ts';
import { GitLaneRepo } from '#src/adapters/git/lane-repo.ts';
import { HerdrFleetPorts } from '#src/adapters/herdr/fleet.ts';
import { frontendFor } from '#src/adapters/frontend.ts';
import type { FlushTab, Frontend } from '#src/ports/frontend.ts';
import type { Fleet } from '#src/ports/fleet.ts';
import { AUTO_PATH_KINDS, PathHarnessDirectory } from '#src/adapters/harness/on-path.ts';
import { Pidfile } from '#src/adapters/os/pidfile.ts';
import { codeVersion } from '#src/adapters/os/plugin-version.ts';
import { SystemClock } from '#src/adapters/os/system-clock.ts';
import { CatalogueWindows } from '#src/adapters/capability/catalogue.ts';
import { agentWindows } from '#src/adapters/capability/context-window.ts';
import { systemCompactLimits } from '#src/adapters/capability/compact-limits.ts';
import type { Compaction } from '#src/recap/application/compaction.ts';
import { LaneContexts } from '#src/recap/application/lane-contexts.ts';
import { LaneClaims } from '#src/recap/application/lane-claims.ts';
import { handoffRestartOf, pollHandoffs, pruneHandoffAnswers, wireHandoffs, type HandoffRunner } from './handoff.ts';
import { handoffExchangeOf } from './handoff-exchange-wiring.ts';
import { withdrawAsked } from '#src/recap/application/handoff-exchange.ts';
import { LaneRecent } from '#src/recap/application/lane-recent.ts';
import { LaneWebs } from '#src/recap/application/lane-webs.ts';
import type { Sharing } from '#src/recap/application/dispatch.ts';
import { dispatchFor, listeningOf, type Box } from './dispatch-parts.ts';
import { SettleHub } from '#src/recap/application/settle-hub.ts';
import { laneTurns, parseStatusPush } from './lane-turns.ts';
import { Informer, type Blindness } from '#src/recap/application/informer.ts';
import { emptyBoard, type Board } from '#src/recap/domain/board.ts';
import { parseTabId } from '#src/recap/domain/ids.ts';
import type { Intent } from '#src/recap/domain/intent.ts';
import type { TabRecaps } from '#src/engine/tab-recaps.ts';
import { wireEngine } from './engine-wire.ts';
import type { Viewers } from './view/viewers.ts';
import { onBeatOf } from './follow-board.ts';
import type { Engine, LedgerEvent } from '@stateforge-labs/session-ledger';
import type { Clock } from '@stateforge-labs/session-ledger';
import type { TranscriptRegistry } from '@stateforge-labs/session-ledger';
import { SLOT_TABLE } from './slot-table.ts';
import { contextOf, parseRoot, parseSwitch, parseVersion, startSlots, taps, type Line, type Slots, type SlotKey, type StatusEvent, type Switch, type Version } from './slots.ts';
import { Backends } from './backends.ts';
import { boundedBy } from './bounded.ts';
import { SHUTDOWN_MS, shutDownWithin } from './shutdown.ts';
import { OWN_PID, openStateAt } from './state.ts';
import type { SafePointWatch } from '@stateforge-labs/session-ledger';
import { candidateOf, candidatesOf, wireAutocompact } from './autocompact.ts';
import { AutocompactSweep } from '@stateforge-labs/session-ledger';
import { wireCompaction } from './compaction.ts';
import { createPreCompacts } from '#src/adapters/hooks/pre-compacts.ts';
import { advertisedCapability, herdrEventsPresence, screenWanted, settingGetter, loadSettings, messagesOf, stateDirectory } from './config.ts';
import { curated, curationOf } from './curate.ts';
import { InputRetention } from '#src/recap/application/input-retention.ts';
import { forgetClosedTabs } from './retention.ts';
import { bootObservations } from './restored-lanes.ts';
import { CompactRequestQueue } from '#src/recap/application/compact-requests.ts';
import { restartAnswers } from '#src/recap/application/ask-restart.ts';
import { REGISTRY } from '#src/recap/domain/token-registry.ts';
import { EventStream } from '#src/recap/application/lane-events.ts';
import { PaneTypingLease } from '#src/recap/application/typing-lease.ts';
import { LaneTokenPublisher } from '#src/recap/application/lane-tokens.ts';
import { factsOf } from '#src/recap/application/lane-facts.ts';
import type { LaneTokenFacts } from '#src/recap/domain/lane-tokens.ts';
import type { HerdrEvents } from '#src/recap/domain/herdr-events.ts';
import { duration, instant, type Instant } from '@stateforge-labs/session-ledger';
import type { Directory } from '@stateforge-labs/session-ledger';
import { fsPathOf } from '#src/recap/domain/fs-path.ts';
import { textOf, type NonEmptyText, type Text } from '@stateforge-labs/session-ledger';
import type { HandoffRequests } from '#src/recap/domain/handoff-requests.ts';
import { lazyRuntime } from '#src/adapters/harness/library.ts';
import { routePaneTokens, wireWorktrees, type Worktrees } from './worktrees.ts';
import { ASK_KEEP_MS, CHECKPOINT_EVERY, EVENT_STOP_MS, FLUSH_STOP_MS, INTENT_MS, REQUEST_POLL_MS, RESYNC_MS, RETENTION_EVERY } from './timing.ts';
import { countOf } from '@stateforge-labs/session-ledger';

type ExitCode = 0 | 1;

async function failureLog(sink: (line: Text) => void, what: Text, running: Promise<void>): Promise<void> { try { await running; } catch (error) { sink(textOf(`${what}: ${error instanceof Error ? error.message : String(error)}`)); } }

function log(line: Text | Line | NonEmptyText): void {
    console.error(`${new Date().toISOString()} ${line}`);
}

const nowInstant = (): Instant => instant(Date.now());
const statusTaps = taps<StatusEvent>(log);
const ledgerTaps = taps<LedgerEvent>(log);
const preCompacts = createPreCompacts();

interface Wired {
    readonly informer: Informer;
    readonly viewers: Viewers;
    readonly autocompact: SafePointWatch;
    readonly fleet: Fleet;
    readonly backends: Backends;
    readonly store: Store;
    readonly compaction: Compaction;
    readonly retention: InputRetention;
    readonly sweep: AutocompactSweep;
    readonly laneTokens: LaneTokenPublisher;
    readonly answers: CompactRequestQueue;
    readonly events: EventStream;
    readonly handoffs: HandoffRunner;
    readonly worktrees: Worktrees;
    readonly engine: Engine;
    readonly recaps: TabRecaps;
    readonly transcripts: TranscriptRegistry;
    readonly clock: Clock;
    readonly statuses: (listener: (event: StatusEvent) => void) => () => void;
    readonly ledger: (listener: (event: LedgerEvent) => void) => () => void;
}

const handoffRequestsOn = (): HandoffRequests => loadSettings().handoffRequests;

function wire(root: Directory, { fleet, session }: Frontend, store: Store): Wired {
    const clock = new SystemClock();
    const events = new EventStream({ tokens: fleet, workspaces: fleet, enabled: herdrEventsPresence, startedAt: instant(Date.now() - process.uptime() * 1000), log });
    const backends = new Backends(root, { herdr: fleet, path: new PathHarnessDirectory(AUTO_PATH_KINDS) }, fleet, log, lazyRuntime());
    const transcripts = daemonTranscriptRegistry(fleet, screenWanted);
    const repos = new GitLaneRepo(clock);
    const curation = curationOf({ store, curator: () => backends.curator(), transcripts, clock, log });
    const box: Box = { informer: null, autocompact: null };
    const board = (): Board => box.informer?.current ?? emptyBoard();
    const { engine, recaps, viewers } = wireEngine({ store, backends, transcripts, clock, repos, curation, events, board, ledger: ledgerTaps.emit, log });
    const worktrees = wireWorktrees(store, log);
    const answers = new CompactRequestQueue({ enabled: herdrEventsPresence, board, requests: store.requests, asks: store.asks, tokens: fleet, now: nowInstant, log });
    const exchange = handoffExchangeOf({ store, tokens: fleet, events, board, sharing: (): HerdrEvents => loadSettings().herdrEvents, requests: handoffRequestsOn, log });
    const hub = new SettleHub({ agents: fleet.agents(), listening: listeningOf(box), pause: sleep, now: nowInstant });
    const webs = new LaneWebs(repos);
    const contexts = new LaneContexts(transcripts, agentWindows(new CatalogueWindows()), systemCompactLimits(), () => { const size = loadSettings().compaction.window; return size === null ? null : countOf(size); });
    const laneTokens = new LaneTokenPublisher({ tokens: fleet, enabled: herdrEventsPresence, board, facts: (lane): LaneTokenFacts => factsOf(lane, { contexts, records: store.records, ledger: store.ledger }), capability: advertisedCapability, now: nowInstant, log, events });
    const dispatch = dispatchFor(box, { fleet, store, recaps, transcripts, webs, contexts, events, sharing: (): Sharing => (herdrEventsPresence() === 'present' ? 'on' : 'off') }, log);
    const turns = laneTurns({ hub, compactions: store.compactions, board: (): Board => box.informer?.current ?? emptyBoard(), now: nowInstant, statused: statusTaps.emit });
    const informer = new Informer(fleet, clock, loadSettings().policy, {
        onIntents: async (intents: readonly Intent[]): Promise<void> => {
            for (const intent of intents) {
                if (await boundedBy(dispatch.send(intent), duration(INTENT_MS)) === 'timeout') {
                    log(textOf(`intent ${intent.kind} took more than ${INTENT_MS / 1000} s: moving on`));
                }
                await new Promise<void>((resolve) => { setImmediate(resolve); });
            }
        },
        onBlind: (blindness: Blindness): void => { log(textOf(`blind at ${blindness.at}: ${blindness.saying}`)); },
        onUnknownKind: (): void => { },
        onBeat: onBeatOf((current: Board): void => { worktrees.registry.beat(current); }, recaps, board, loadSettings().pacing),
        onStatus: parseStatusPush.bind(undefined, turns),
        onPaneTokens: routePaneTokens(worktrees, answers, exchange),
        sessionIdentity: sessionOfForKind,
    });
    box.informer = informer;
    const recent = new LaneRecent(transcripts, session);
    const claims = new LaneClaims();
    const autocompact = (box.autocompact = wireAutocompact({ store, transcripts, contexts, recent, recaps, informer, decider: () => backends.decider(), log, events, claims }));
    const compaction = wireCompaction({
        fleet, records: store.records, boundaries: store.boundaries, ledger: store.ledger, compactions: store.compactions, settling: hub, webs, recaps, informer, log,
        briefs: () => backends.brief(), recent, coverageDecider: () => backends.coverageDecider(), decisions: store.decisions, checkedBriefs: store.autocompactBriefs, answers, asks: store.asks, events, claims, preCompacts,
        typing: new PaneTypingLease({ tokens: fleet, panes: fleet, now: nowInstant, pause: sleep, log }),
    });
    return { informer, fleet, backends, store, engine, recaps, transcripts, clock, viewers, autocompact, statuses: statusTaps.tap, ledger: ledgerTaps.tap, compaction, retention: new InputRetention({ inputs: store.inputs, briefs: store.autocompactBriefs, clock, days: () => loadSettings().keepInputDays, briefRetention: (): BriefRetention => loadSettings().keepBrief, log }), sweep: new AutocompactSweep({ candidates: () => candidatesOf(informer.current, log), autocompact: (): SafePointWatch | null => box.autocompact, log }), laneTokens, answers, events, worktrees, handoffs: wireHandoffs({ store, fleet, transcripts, repos, claims, recaps, board, mirror: exchange.mirror, pause: sleep, log }) };
}

function versionOf(): Version | null { const version = codeVersion(); return version === null ? null : parseVersion(version); }

function poll(pidfile: Pidfile, wired: Pick<Wired, 'store' | 'informer' | 'compaction' | 'engine' | 'laneTokens' | 'answers' | 'events' | 'handoffs'>): void {
    const { store, informer, compaction, engine, laneTokens, answers, events, handoffs } = wired;
    pidfile.beat();
    laneTokens.tick();
    answers.tick();
    events.tick();
    store.requests.takeRequests().forEach((tab) => { informer.push({ kind: 'requested', tab }); });
    for (const asked of store.requests.takeCompactions()) {
        void failureLog(log, textOf(`compaction ${asked.tab}`), compaction.run(asked));
    }
    pollHandoffs({ runner: handoffs, requests: store.requests, log });
    for (const tab of store.requests.takeCurations()) {
        void failureLog(log, textOf(`curator ${tab}`), curated(engine, tab, log));
    }
    for (const asked of store.requests.takeVisibility()) {
        informer.push({ kind: 'visibility', target: asked.target === 'all' ? 'all' : { tab: must(parseTabId(asked.target)) }, hidden: asked.visibility === 'toggle' ? 'toggle' : asked.visibility === 'hidden' });
    }
}

async function boot(root: Directory, pidfile: Pidfile): Promise<Wired | ExitCode> {
    const other = pidfile.alive();
    if (other !== null && other !== process.pid) {
        log(textOf(`another daemon is running (pid ${other})`));
        return 0;
    }
    pidfile.claim(OWN_PID, codeVersion());
    pidfile.beat();
    const frontend = frontendFor(() => new HerdrFleetPorts(textOf(root)));
    const opened = await openStateAt(root, frontend.fleet, log);
    if (opened === null) {
        pidfile.release(OWN_PID);
        return 1;
    }
    const flushing: { run: FlushTab | null } = { run: null };
    const flush: FlushTab = (tab, why) => flushing.run === null ? Promise.resolve() : flushing.run(tab, why);
    const wired = wire(root, frontend, frontend.wrap(opened, log, flush));
    flushing.run = (tab, why): Promise<void> => wired.recaps.flush(tab, why);
    return wired;
}

async function start(): Promise<ExitCode> {
    const root = stateDirectory();
    const pidfile = new Pidfile(fsPathOf(root));
    const booted = await boot(root, pidfile);
    if (typeof booted === 'number') return booted;
    const { informer, fleet, backends, store, retention, sweep, events, handoffs, worktrees, engine, recaps, transcripts, clock, viewers, statuses, ledger } = booted;
    let stopping = false;
    let slots: Slots | null = null;
    const stop = (): void => {
        if (stopping) {
            return;
        }
        stopping = true;
        void boundedBy(events.daemon('daemon-stopping', textOf(codeVersion() ?? 'unknown')), duration(EVENT_STOP_MS)).then(() => shutDownWithin(fleet, informer, log, duration(SHUTDOWN_MS))).then(() => boundedBy(slots?.stop() ?? Promise.resolve(), duration(EVENT_STOP_MS))).then(() => boundedBy(recaps.flushAll(), duration(FLUSH_STOP_MS))).finally(() => { store.close(); pidfile.release(OWN_PID); process.exit(0); });
    };
    process.on('SIGTERM', stop).on('SIGINT', stop);
    const restarted = restartAnswers({
        exchanges: REGISTRY.exchanges, ledger: store.asks, requests: store.requests, compactions: store.compactions, tokens: fleet,
        enabled: herdrEventsPresence, local: (ask): void => { log(textOf(`ask ${ask.id} from ${ask.requester}: interrupted, no local flow answers yet`)); },
        handoff: handoffRestartOf(handoffs), withdraw: (ask): void => { withdrawAsked(store.requests, ask); },
        log, now: nowInstant, restartedWhy: textOf(messagesOf().compaction.stage.restarted),
    });
    if (restarted > 0) { log(textOf(`${restarted} compaction(s) were in progress when the daemon stopped: not confirmed`)); }
    bootObservations(store.visibility.readHidden(), store.views, log).forEach((observation) => { informer.push(observation); });
    setInterval(() => { poll(pidfile, booted); slots?.poll(); }, REQUEST_POLL_MS).unref();
    let ticks = 0;
    setInterval(() => {
        ticks += 1;
        if (ticks % CHECKPOINT_EVERY === 0) {
            store.checkpoint();
        }
        if (ticks % RETENTION_EVERY === 1) {
            forgetClosedTabs(store, log);
        }
        informer.tick();
        store.asks.prune(instant(Date.now() - ASK_KEEP_MS));
        pruneHandoffAnswers({ answers: store.handoffs, now: nowInstant });
        events.prune(nowInstant());
        sweep.tick();
        retention.tick();
        worktrees.registry.tick(informer.current);
        worktrees.perf.tick();
        slots?.tick();
        void backends.refresh();
    }, RESYNC_MS).unref();
    await backends.refresh();
    slots = await startSlots(SLOT_TABLE, contextOf({ root: parseRoot(root), store, fleet, engine, recaps, transcripts, events, board: (): Board => informer.current, observe: (observation): void => { informer.push(observation); }, statuses, ledger, candidates: () => candidatesOf(informer.current, log), consider: (candidate) => booted.autocompact.consider(candidate), clock, viewers, preCompacts, claimIdle: (lane) => { const found = candidateOf(lane); return found === null ? 'declined' : booted.autocompact.claimIdle(found); }, log }, versionOf(), (key: SlotKey): Switch => parseSwitch(settingGetter()(key))));
    log(textOf(`daemon ${process.pid} up, state in ${root}`));
    void events.daemon('daemon-started', textOf(codeVersion() ?? 'unknown'));
    await informer.enterSubscription();
    await informer.run();
    pidfile.release(OWN_PID);
    return 0;
}

process.exitCode = await start();
