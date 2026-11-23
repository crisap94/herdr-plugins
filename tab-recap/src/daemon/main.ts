import { setTimeout as sleep } from 'node:timers/promises';
import type { BriefRetention } from '#src/recap/domain/autocompact.ts';
import { daemonTranscriptRegistry } from '#src/adapters/transcripts/registry.ts';
import { sessionOfForKind } from '#src/adapters/herdr/session-registry.ts';
import type { Store } from '#src/adapters/db/database.ts';
import { GitLaneRepo } from '#src/adapters/git/lane-repo.ts';
import { HerdrFleet } from '#src/adapters/herdr/fleet.ts';
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
import { dispatchFor, type Box } from './dispatch-parts.ts';
import { SettleHub } from '#src/recap/application/settle-hub.ts';
import { laneTurns, parseStatusPush } from './lane-turns.ts';
import { Informer, type Blindness } from '#src/recap/application/informer.ts';
import { emptyBoard, type Board } from '#src/recap/domain/board.ts';
import { tabId } from '#src/recap/domain/ids.ts';
import type { Intent } from '#src/recap/domain/intent.ts';
import type { TabRecaps } from '#src/engine/tab-recaps.ts';
import { wireEngine } from './engine-wire.ts';
import type { Viewers } from './view/viewers.ts';
import { onBeatOf } from './follow-board.ts';
import type { Engine, LedgerEvent } from '@stateforge-labs/session-ledger';
import type { Clock } from '#src/ports/clock.ts';
import type { TranscriptRegistry } from '#src/ports/transcript-registry.ts';
import { SLOT_TABLE } from './slot-table.ts';
import { contextOf, parseRoot, parseSwitch, parseVersion, startSlots, taps, type Slots, type SlotKey, type StatusEvent, type Switch, type Version } from './slots.ts';
import { Backends } from './backends.ts';
import { boundedBy } from './bounded.ts';
import { capabilityNow, failureLog, herdrEventsOn, herdrEventsPresence, listeningIn, logVia, paneTokensTo, wantsScreen } from './legacy.ts';
import { SHUTDOWN_MS, shutDownWithin } from './shutdown.ts';
import { openStateAt } from './state.ts';
import type { Autocompact } from '#src/recap/application/autocompact.ts';
import { candidateOf, candidatesOf, wireAutocompact } from './autocompact.ts';
import { AutocompactSweep } from './autocompact-sweep.ts';
import { wireCompaction } from './compaction.ts';
import { createPreCompacts } from '#src/adapters/hooks/pre-compacts.ts';
import { settingGetter, loadSettings, messagesOf, stateDirectory } from './config.ts';
import { wireCurate } from './curate.ts';
import type { CurateTasks } from '#src/recap/application/curate.ts';
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
import type { LaneFacts } from '#src/recap/domain/lane-tokens.ts';
import type { HerdrEvents } from '#src/recap/domain/herdr-events.ts';
import { duration, instant, type Instant } from '#src/recap/domain/time.ts';
import type { Directory } from '#src/recap/domain/directory.ts';
import type { Text } from '#src/recap/domain/text.ts';
import type { HandoffRequests } from '#src/recap/domain/handoff-requests.ts';
import { createRuntime } from '@stateforge-labs/harness-adapters/runtime';
import { wireWorktrees, type Worktrees } from './worktrees.ts';
import { ASK_KEEP_MS, CHECKPOINT_EVERY, EVENT_STOP_MS, FLUSH_STOP_MS, INTENT_MS, REQUEST_POLL_MS, RESYNC_MS, RETENTION_EVERY } from './timing.ts';
import { textOf } from '#src/recap/domain/text.ts';

type ExitCode = 0 | 1;

function write(line: Text): void {
    console.error(`${new Date().toISOString()} ${line}`);
}

const log = logVia(write);

const nowInstant = (): Instant => instant(Date.now());
const statusTaps = taps<StatusEvent>(log);
const ledgerTaps = taps<LedgerEvent>(log);
const preCompacts = createPreCompacts();

interface Wired {
    readonly informer: Informer;
    readonly viewers: Viewers;
    readonly autocompact: Autocompact;
    readonly fleet: Fleet;
    readonly backends: Backends;
    readonly store: Store;
    readonly compaction: Compaction;
    readonly retention: InputRetention;
    readonly curate: CurateTasks;
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
    const events = new EventStream({ tokens: fleet, workspaces: fleet, enabled: herdrEventsOn, startedAt: Date.now() - process.uptime() * 1000, log });
    const backends = new Backends(root, { herdr: fleet, path: new PathHarnessDirectory(AUTO_PATH_KINDS) }, fleet, log, createRuntime());
    const transcripts = daemonTranscriptRegistry(fleet, wantsScreen);
    const repos = new GitLaneRepo(clock);
    const curate = wireCurate({ store, curator: () => backends.curator(), transcripts, log });
    const box: Box = { informer: null, autocompact: null };
    const board = (): Board => box.informer?.current ?? emptyBoard();
    const { engine, recaps, viewers } = wireEngine({ store, backends, transcripts, clock, repos, curate, events, board, ledger: ledgerTaps.emit, log });
    const worktrees = wireWorktrees(store, log);
    const answers = new CompactRequestQueue({ enabled: herdrEventsPresence, board, requests: store.requests, asks: store.asks, tokens: fleet, now: nowInstant, log });
    const exchange = handoffExchangeOf({ store, tokens: fleet, events, board, sharing: (): HerdrEvents => loadSettings().herdrEvents, requests: handoffRequestsOn, log });
    const hub = new SettleHub({ agents: fleet.agents(), listening: listeningIn(box), pause: sleep, now: nowInstant });
    const webs = new LaneWebs(repos);
    const contexts = new LaneContexts(transcripts, agentWindows(new CatalogueWindows()), systemCompactLimits(), () => loadSettings().compaction.window);
    const laneTokens = new LaneTokenPublisher({ tokens: fleet, enabled: herdrEventsOn, board, facts: (lane): LaneFacts => factsOf(lane, { contexts, records: store.records, ledger: store.ledger }), capability: capabilityNow, now: nowInstant, log, events });

    const dispatch = dispatchFor(box, { fleet, store, recaps, transcripts, webs, contexts, events, sharing: (): Sharing => (herdrEventsOn() ? 'on' : 'off') }, log);
    const turns = laneTurns({ hub, compactions: store.compactions, board: (): Board => box.informer?.current ?? emptyBoard(), now: nowInstant, statused: statusTaps.emit });
    const informer = new Informer(fleet, clock, loadSettings().policy, {
        onIntents: async (intents: readonly Intent[]): Promise<void> => {
            for (const intent of intents) {
                if (await boundedBy(dispatch.send(intent), duration(INTENT_MS)) === 'timeout') {
                    log(`intent ${intent.kind} took more than ${INTENT_MS / 1000} s: moving on`);
                }
                await new Promise<void>((resolve) => { setImmediate(resolve); });
            }
        },
        onBlind: (blindness: Blindness): void => { log(`blind at ${blindness.at}: ${blindness.saying}`); },
        onUnknownKind: (): void => { },
        onBeat: onBeatOf((current: Board): void => { worktrees.registry.beat(current); }, recaps, board, loadSettings().pacing),
        onStatus: parseStatusPush.bind(undefined, turns),
        onPaneTokens: paneTokensTo(worktrees, answers, exchange),
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
    return { informer, fleet, backends, store, engine, recaps, transcripts, clock, viewers, autocompact, statuses: statusTaps.tap, ledger: ledgerTaps.tap, compaction, retention: new InputRetention({ inputs: store.inputs, briefs: store.autocompactBriefs, clock, days: () => loadSettings().keepInputDays, briefRetention: (): BriefRetention => loadSettings().keepBrief, log }), curate, sweep: new AutocompactSweep({ candidates: () => candidatesOf(informer.current, log), autocompact: (): Autocompact | null => box.autocompact, log }), laneTokens, answers, events, worktrees, handoffs: wireHandoffs({ store, fleet, transcripts, repos, claims, recaps, board, mirror: exchange.mirror, pause: sleep, log: write }) };
}

function versionOf(): Version | null { const version = codeVersion(); return version === null ? null : parseVersion(version); }

function poll(pidfile: Pidfile, wired: Pick<Wired, 'store' | 'informer' | 'compaction' | 'curate' | 'laneTokens' | 'answers' | 'events' | 'handoffs'>): void {
    const { store, informer, compaction, curate, laneTokens, answers, events, handoffs } = wired;
    pidfile.beat();
    laneTokens.tick();
    answers.tick();
    events.tick();
    for (const tab of store.requests.takeRequests()) {
        informer.push({ kind: 'requested', tab });
    }
    for (const asked of store.requests.takeCompactions()) {
        compaction.run(asked).catch(failureLog(log, `compaction ${asked.tab}`));
    }
    pollHandoffs({ runner: handoffs, requests: store.requests, log });
    for (const tab of store.requests.takeCurations()) {
        curate.run(tab).catch(failureLog(log, `curator ${tab}`));
    }
    for (const asked of store.requests.takeVisibility()) {
        informer.push({ kind: 'visibility', target: asked.target === 'all' ? 'all' : { tab: tabId(asked.target) }, hidden: asked.visibility === 'toggle' ? 'toggle' : asked.visibility === 'hidden' });
    }
}

async function boot(root: Directory, pidfile: Pidfile): Promise<Wired | ExitCode> {
    const other = pidfile.alive();
    if (other !== null && other !== process.pid) {
        log(`another daemon is running (pid ${other})`);
        return 0;
    }
    pidfile.claim(process.pid, codeVersion());
    pidfile.beat();
    const frontend = frontendFor(() => new HerdrFleet(textOf(root)));
    const opened = await openStateAt(root, frontend.fleet, log);
    if (opened === null) {
        pidfile.release(process.pid);
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
    const pidfile = new Pidfile(root);
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
        void boundedBy(events.daemon('daemon-stopping', codeVersion() ?? 'unknown'), duration(EVENT_STOP_MS)).then(() => shutDownWithin(fleet, informer, log, duration(SHUTDOWN_MS))).then(() => boundedBy(slots?.stop() ?? Promise.resolve(), duration(EVENT_STOP_MS))).then(() => boundedBy(recaps.flushAll(), duration(FLUSH_STOP_MS))).finally(() => { store.close(); pidfile.release(process.pid); process.exit(0); });
    };
    process.on('SIGTERM', stop).on('SIGINT', stop);
    const restarted = restartAnswers({
        exchanges: REGISTRY.exchanges, ledger: store.asks, requests: store.requests, compactions: store.compactions, tokens: fleet,
        enabled: herdrEventsPresence, local: (ask): void => { log(`ask ${ask.id} from ${ask.requester}: interrupted, no local flow answers yet`); },
        handoff: handoffRestartOf(handoffs), withdraw: (ask): void => { withdrawAsked(store.requests, ask); },
        log, now: nowInstant, restartedWhy: textOf(messagesOf().compaction.stage.restarted),
    });
    if (restarted > 0) { log(`${restarted} compaction(s) were in progress when the daemon stopped: not confirmed`); }
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
        events.prune(Date.now());
        sweep.tick();
        retention.tick();
        worktrees.registry.tick(informer.current);
        worktrees.perf.tick();
        slots?.tick();
        void backends.refresh();
    }, RESYNC_MS).unref();
    await backends.refresh();
    slots = await startSlots(SLOT_TABLE, contextOf({ root: parseRoot(root), store, fleet, engine, recaps, transcripts, events, board: (): Board => informer.current, observe: (observation): void => { informer.push(observation); }, statuses, ledger, candidates: () => candidatesOf(informer.current, log), consider: (candidate) => booted.autocompact.consider(candidate), clock, viewers, preCompacts, claimIdle: (lane) => { const found = candidateOf(lane); return found === null ? 'declined' : booted.autocompact.claimIdle(found); }, log }, versionOf(), (key: SlotKey): Switch => parseSwitch(settingGetter()(key))));
    log(`daemon ${process.pid} up, state in ${root}`);
    void events.daemon('daemon-started', codeVersion() ?? 'unknown');
    await informer.enterSubscription();
    await informer.run();
    pidfile.release(process.pid);
    return 0;
}

process.exitCode = await start();
