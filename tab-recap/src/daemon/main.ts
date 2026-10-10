import type { BriefRetention } from '#src/recap/domain/autocompact.ts';
import { daemonTranscriptRegistry } from '#src/adapters/transcript-registry.ts';
import { sessionOfForKind } from '#src/adapters/session-registry.ts';
import type { Store } from '#src/adapters/db/database.ts';
import type { RunEvent } from '#src/recap/application/ledger-reconcile.ts';
import { GitLaneRepo } from '#src/adapters/git-lane-repo.ts';
import { HerdrFleet, readPaneSession } from '#src/adapters/herdr-fleet.ts';
import { PathHarnesses } from '#src/adapters/path-harnesses.ts';
import { Pidfile } from '#src/adapters/pidfile.ts';
import { codeVersion } from '#src/adapters/plugin-version.ts';
import { SystemClock } from '#src/adapters/system-clock.ts';
import type { Enumerators } from '#src/ports/enumerators.ts';
import type { Summarizer } from '#src/ports/summarizer.ts';
import type { Pipeline } from '#src/recap/domain/pipeline.ts';
import { LocalCatalogue } from '#src/adapters/model-catalogue.ts';
import { contextWindows } from '#src/adapters/context-window.ts';
import type { Compaction } from '#src/recap/application/compaction.ts';
import { LaneContexts } from '#src/recap/application/lane-contexts.ts';
import { CompactionClaims } from '#src/recap/application/compaction-claims.ts';
import { LaneRecent } from '#src/recap/application/lane-recent.ts';
import { LaneWebs } from '#src/recap/application/lane-webs.ts';
import { dispatchFor } from './dispatch-parts.ts';
import type { Box } from './dispatch-parts.ts';
import { SettleHub } from '#src/recap/application/settle-hub.ts';
import { laneTurns } from './lane-turns.ts';
import { Informer } from '#src/recap/application/informer.ts';
import type { Blindness } from '#src/recap/application/informer.ts';
import { emptyBoard } from '#src/recap/domain/board.ts';
import type { Board } from '#src/recap/domain/board.ts';
import { lanesOf } from '#src/recap/domain/board.ts';
import { tabId } from '#src/recap/domain/ids.ts';
import type { Intent } from '#src/recap/domain/intent.ts';
import { RecapJob } from '#src/recap/application/recap-job.ts';
import type { Extension } from '#src/ports/extension.ts';
import { AUTO_ORDER, Backends } from './backends.ts';
import { bounded } from './bounded.ts';
import { shutDown } from './shutdown.ts';
import { openState } from './state.ts';
import { loadExtensions } from '#src/extensions/load.ts';
import type { Autocompact } from '#src/recap/application/autocompact.ts';
import { wireAutocompact } from './autocompact.ts';
import { AutocompactSweep } from './autocompact-sweep.ts';
import { wireCompaction } from './compaction.ts';
import { configGetter, loadConfig, messagesOf, stateDir } from './config.ts';
import { wireCurate } from './curate.ts';
import type { Curate } from '#src/recap/application/curate.ts';
import { ANY_KIND } from '#src/recap/domain/policy.ts';
import { upkeep } from './upkeep.ts';
import { InputRetention } from '#src/recap/application/input-retention.ts';
import { forgetClosedTabs } from './retention.ts';
import { CompactRequests } from '#src/recap/application/compact-requests.ts';
import { EventStream, recapWritten } from '#src/recap/application/lane-events.ts';
import { TypingLease } from '#src/recap/application/typing-lease.ts';
import { LaneTokenPublisher } from '#src/recap/application/lane-tokens.ts';
import { factsOf } from '#src/recap/application/lane-facts.ts';
import type { LaneFacts } from '#src/recap/domain/lane-tokens.ts';

const REQUEST_POLL_MS = 1000;
const RESYNC_MS = 60_000;
const CHECKPOINT_EVERY = 10;
const RETENTION_EVERY = 1440;
const INTENT_MS = 90_000;
const ASK_KEEP_MS = 30 * 24 * 60 * 60_000;

const sleep = (ms: number): Promise<void> => new Promise<void>((resolve) => { setTimeout(resolve, ms); });
const EVENT_STOP_MS = 2_000;

const log = (line: string): void => {
    console.error(`${new Date().toISOString()} ${line}`);
};

interface Wired {
    readonly informer: Informer;
    readonly fleet: HerdrFleet;
    readonly backends: Backends;
    readonly extensions: readonly Extension[];
    readonly store: Store;
    readonly compaction: Compaction;
    readonly retention: InputRetention;
    readonly curate: Curate;
    readonly sweep: AutocompactSweep;
    readonly laneTokens: LaneTokenPublisher;
    readonly answers: CompactRequests;
    readonly events: EventStream;
}

function ranRun(curate: Curate, events: EventStream, board: () => Board, event: RunEvent, say: (line: string) => void): void {
    curate.afterRun(event).catch((error: unknown) => { say(`curator ${event.tab}: ${error instanceof Error ? error.message : String(error)}`); });
    recapWritten(events, lanesOf(board(), tabId(event.tab)), event.cause);
}

function answerRestart(store: Store, answers: CompactRequests): number {
    const interrupted = [...store.compactions.unfinishedAsks(), ...store.requests.takeAnswered()];
    const restarted = store.compactions.interrupted(Date.now(), messagesOf().compaction.stage.restarted);
    answers.answerInterrupted(interrupted);
    return restarted;
}

const herdrEventsOn = (): boolean => loadConfig().herdrEvents === 'on';

function wantsScreen(agent: string): boolean {
    const { screenAgents } = loadConfig();
    return screenAgents.includes(ANY_KIND) || screenAgents.includes(agent);
}

function wire(root: string, fleet: HerdrFleet, store: Store): Wired {
    const config = loadConfig();
    const clock = new SystemClock();
    const events = new EventStream({ tokens: fleet, workspaces: fleet, enabled: herdrEventsOn, startedAt: Date.now() - process.uptime() * 1000, log });
    const backends = new Backends(root, { herdr: fleet, path: new PathHarnesses(AUTO_ORDER) }, fleet, log);
    const transcripts = daemonTranscriptRegistry(fleet, wantsScreen);
    const repos = new GitLaneRepo(clock);
    const curate = wireCurate({ store, curator: () => backends.curator(), transcripts, log });
    const recaps = new RecapJob({
        transcripts,
        records: store.records, ledger: store.ledger, clock, log, repos,
        summarizer: (): Summarizer => backends.summarizer(),
        language: (): string => loadConfig().recapLanguage,
        keepInput: (): boolean => loadConfig().keepInputDays > 0,
        pipeline: (): Pipeline => loadConfig().pipeline,
        enumerator: (): Enumerators | null => backends.enumerator(),
        ran: (event): void => { ranRun(curate, events, () => box.informer?.current ?? emptyBoard(), event, log); },
    });
    const box: Box = { informer: null, autocompact: null };
    const board = (): Board => box.informer?.current ?? emptyBoard();
    const answers = new CompactRequests({ enabled: herdrEventsOn, board, requests: store.requests, asks: store.asks, tokens: fleet, log });
    const hub = new SettleHub({ agents: fleet.agents(), listening: (): boolean => box.informer?.listening ?? false, pause: (ms: number): Promise<void> => new Promise<void>((resolve) => { setTimeout(resolve, ms); }), now: (): number => Date.now() });
    const webs = new LaneWebs(repos);
    const contexts = new LaneContexts(transcripts, contextWindows(new LocalCatalogue()), () => loadConfig().compaction.window);
    const laneTokens = new LaneTokenPublisher({ tokens: fleet, enabled: herdrEventsOn, board, facts: (lane): LaneFacts => factsOf(lane, { contexts, records: store.records, ledger: store.ledger }), now: (): number => Date.now(), log, events });

    const dispatch = dispatchFor(box, { fleet, store, recaps, transcripts, webs, contexts }, log);
    const informer = new Informer(fleet, clock, config.policy, {
        onIntents: async (intents: readonly Intent[]): Promise<void> => {
            for (const intent of intents) {
                if (await bounded(dispatch.send(intent), INTENT_MS) === 'timeout') {
                    log(`intent ${intent.kind} took more than ${INTENT_MS / 1000} s: moving on`);
                }
                await new Promise<void>((resolve) => { setImmediate(resolve); });
            }
        },
        onBlind: (blindness: Blindness): void => { log(`blind at ${blindness.at}: ${blindness.saying}`); },
        onUnknownKind: (): void => { },
        onBeat: (): void => { },
        onStatus: laneTurns({ hub, compactions: store.compactions, board: (): Board => box.informer?.current ?? emptyBoard(), now: () => Date.now() }),
        onPaneUpdated: (data): void => { answers.onPaneUpdated(data); },
        sessionIdentity: sessionOfForKind,
    });
    box.informer = informer;
    const recent = new LaneRecent(transcripts, readPaneSession);
    const claims = new CompactionClaims();
    box.autocompact = wireAutocompact({ store, transcripts, contexts, recent, recaps, informer, decider: () => backends.decider(), log, events, claims });
    const sweep = new AutocompactSweep({ board: (): Board => informer.current, autocompact: (): Autocompact | null => box.autocompact, log });
    const compaction = wireCompaction({
        fleet, records: store.records, boundaries: store.boundaries, ledger: store.ledger, compactions: store.compactions, settling: hub, webs, recaps, informer, log,
        briefs: () => backends.brief(), recent, coverageDecider: () => backends.coverageDecider(), decisions: store.autocompact, checkedBriefs: store.autocompactBriefs, answers, events, claims,
        typing: new TypingLease({ tokens: fleet, panes: fleet, now: (): number => Date.now(), pause: sleep, log }),
    });
    const retention = new InputRetention({ inputs: store.inputs, briefs: store.autocompactBriefs, clock, days: (): number => loadConfig().keepInputDays, briefRetention: (): BriefRetention => loadConfig().keepBrief, log });
    return { informer, fleet, backends, extensions: loadExtensions(configGetter()), store, compaction, retention, curate, sweep, laneTokens, answers, events };
}

function poll(pidfile: Pidfile, wired: Pick<Wired, 'store' | 'informer' | 'compaction' | 'curate' | 'laneTokens' | 'answers' | 'events'>): void {
    const { store, informer, compaction, curate, laneTokens, answers, events } = wired;
    pidfile.beat();
    laneTokens.tick();
    answers.tick();
    events.tick();
    for (const tab of store.requests.takeRequests()) {
        informer.push({ kind: 'requested', tab });
    }
    for (const asked of store.requests.takeCompactions()) {
        compaction.run(asked).catch((error: unknown) => { log(`compaction ${asked.tab}: ${error instanceof Error ? error.message : String(error)}`); });
    }
    for (const tab of store.requests.takeCurations()) {
        curate.run(tab).catch((error: unknown) => { log(`curator ${tab}: ${error instanceof Error ? error.message : String(error)}`); });
    }
    for (const asked of store.requests.takeVisibility()) {
        informer.push({ kind: 'visibility', target: asked.target === 'all' ? 'all' : { tab: tabId(asked.target) }, hidden: asked.hidden });
    }
}

async function boot(root: string, pidfile: Pidfile): Promise<Wired | number> {
    const other = pidfile.alive();
    if (other !== null && other !== process.pid) {
        log(`another daemon is running (pid ${other})`);
        return 0;
    }
    pidfile.claim(process.pid, codeVersion());
    pidfile.beat();
    const fleet = new HerdrFleet(root);
    const opened = await openState(root, fleet, log);
    if (opened === null) {
        pidfile.release(process.pid);
        return 1;
    }
    return wire(root, fleet, opened);
}

async function start(): Promise<number> {
    const root = stateDir();
    const pidfile = new Pidfile(root);
    const booted = await boot(root, pidfile);
    if (typeof booted === 'number') {
        return booted;
    }
    const { informer, fleet, backends, extensions, store, retention, sweep, answers, events } = booted;
    let stopping = false;
    const stop = (): void => {
        if (stopping) {
            return;
        }
        stopping = true;
        void bounded(events.daemon('daemon-stopping', codeVersion() ?? 'unknown'), EVENT_STOP_MS).then(() => shutDown(fleet, informer, log)).finally(() => { store.close(); pidfile.release(process.pid); process.exit(0); });
    };
    process.on('SIGTERM', stop);
    process.on('SIGINT', stop);
    const restarted = answerRestart(store, answers);
    if (restarted > 0) {
        log(`${restarted} compaction(s) were in progress when the daemon stopped: not confirmed`);
    }
    informer.push({ kind: 'hidden-restored', state: store.visibility.readHidden() });
    setInterval(() => { poll(pidfile, booted); }, REQUEST_POLL_MS).unref();
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
        store.asks.prune(Date.now() - ASK_KEEP_MS);
        events.prune(Date.now());
        sweep.tick();
        retention.tick();
        void backends.refresh();
        void upkeep(extensions, log);
    }, RESYNC_MS).unref();
    await backends.refresh();
    log(`daemon ${process.pid} up, state in ${root}`);
    void events.daemon('daemon-started', codeVersion() ?? 'unknown');
    await informer.enterSubscription();
    await informer.run();
    pidfile.release(process.pid);
    return 0;
}

process.exitCode = await start();
