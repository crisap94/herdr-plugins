// The composition root and the loop. Started detached by `bin/tab-recap.ts start`.
import { ClaudeTranscripts } from '#src/adapters/claude-transcripts.ts';
import { CodexTranscripts } from '#src/adapters/codex-transcripts.ts';
import { OpencodeTranscripts } from '#src/adapters/opencode-transcripts.ts';
import { ScreenTranscripts } from '#src/adapters/screen-transcripts.ts';
import type { Store } from '#src/adapters/db/database.ts';
import { GitLaneRepo } from '#src/adapters/git-lane-repo.ts';
import { HerdrFleet } from '#src/adapters/herdr-fleet.ts';
import { PathHarnesses } from '#src/adapters/path-harnesses.ts';
import { Pidfile } from '#src/adapters/pidfile.ts';
import { codeVersion } from '#src/adapters/plugin-version.ts';
import { SystemClock } from '#src/adapters/system-clock.ts';
import type { Summarizer } from '#src/ports/summarizer.ts';
import { LocalCatalogue } from '#src/adapters/model-catalogue.ts';
import type { Compaction } from '#src/recap/application/compaction.ts';
import { LaneContexts } from '#src/recap/application/lane-contexts.ts';
import { LaneRecent } from '#src/recap/application/lane-recent.ts';
import { LaneWebs } from '#src/recap/application/lane-webs.ts';
import { LivePrompts } from '#src/recap/application/live-prompts.ts';
import { Dispatch } from '#src/recap/application/dispatch.ts';
import { SettleHub } from '#src/recap/application/settle-hub.ts';
import { laneTurns } from './lane-turns.ts';
import { Informer } from '#src/recap/application/informer.ts';
import type { Blindness } from '#src/recap/application/informer.ts';
import { emptyBoard } from '#src/recap/domain/board.ts';
import type { Board } from '#src/recap/domain/board.ts';
import type { Observation } from '#src/recap/domain/fold.ts';
import { tabId } from '#src/recap/domain/ids.ts';
import type { Intent } from '#src/recap/domain/intent.ts';
import type { Sizing } from '#src/recap/domain/layout.ts';
import { RecapJob } from '#src/recap/application/recap-job.ts';
import type { Extension } from '#src/ports/extension.ts';
import { AUTO_ORDER, Backends } from './backends.ts';
import { bounded } from './bounded.ts';
import { shutDown } from './shutdown.ts';
import { openState } from './state.ts';
import { loadExtensions } from '#src/extensions/load.ts';
import { wireCompaction } from './compaction.ts';
import { configGetter, loadConfig, messagesOf, stateDir } from './config.ts';
import { wireCurate } from './curate.ts';
import type { Curate } from '#src/recap/application/curate.ts';
import { ANY_KIND } from '#src/recap/domain/policy.ts';
import { upkeep } from './upkeep.ts';
import { InputRetention } from '#src/recap/application/input-retention.ts';

const REQUEST_POLL_MS = 1000;
const RESYNC_MS = 60_000;
/** every this many resync ticks the write-ahead log is folded back into the database file (10 minutes) */
const CHECKPOINT_EVERY = 10;
/** an intent is a handful of herdr requests of at most 10 s each */
const INTENT_MS = 90_000;

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
}

/** A lane is read from its screen only for the kinds the operator listed (re-read on every use). */
function wantsScreen(agent: string): boolean {
    const { screenAgents } = loadConfig();
    return screenAgents.includes(ANY_KIND) || screenAgents.includes(agent);
}

function wire(root: string, fleet: HerdrFleet, store: Store): Wired {
    const config = loadConfig();
    const clock = new SystemClock();
    const backends = new Backends(root, { herdr: fleet, path: new PathHarnesses(AUTO_ORDER) }, fleet, log);
    const transcripts = [new ClaudeTranscripts(), new CodexTranscripts(), new OpencodeTranscripts(), new ScreenTranscripts(fleet, wantsScreen)];
    const repos = new GitLaneRepo(clock);
    const recaps = new RecapJob({
        transcripts,
        records: store.records, ledger: store.ledger, clock, log, repos,
        summarizer: (): Summarizer => backends.summarizer(),
        language: (): string => loadConfig().recapLanguage,
        keepInput: (): boolean => loadConfig().keepInputDays > 0,
    });
    const box: { informer: Informer | null } = { informer: null };
    const hub = new SettleHub({ agents: fleet.agents(), listening: (): boolean => box.informer?.listening ?? false, pause: (ms: number): Promise<void> => new Promise<void>((resolve) => { setTimeout(resolve, ms); }), now: (): number => Date.now() });
    const webs = new LaneWebs(repos);
    const contexts = new LaneContexts(transcripts, new LocalCatalogue(), () => loadConfig().compaction.window);
    const dispatch = new Dispatch({
        columns: fleet, views: store.views, visibility: store.visibility, recaps, log, prompts: new LivePrompts(transcripts), webs, contexts,
        sizing: (): Sizing => loadConfig().sizing,
        board: (): Board => {
            if (box.informer === null) {
                throw new Error('dispatch before the informer exists');
            }
            return box.informer.current;
        },
        feedback: (observation: Observation): void => { box.informer?.push(observation); },
    });
    const informer = new Informer(fleet, clock, config.policy, {
        onIntents: async (intents: readonly Intent[]): Promise<void> => {
            for (const intent of intents) {
                // one stuck intent must not stop the daemon from ever folding another observation; and a long run of
                // cheap ones hands the event loop back between intents, so sockets and timers keep being served
                if (await bounded(dispatch.send(intent), INTENT_MS) === 'timeout') {
                    log(`intent ${intent.kind} took more than ${INTENT_MS / 1000} s: moving on`);
                }
                await new Promise<void>((resolve) => { setImmediate(resolve); });
            }
        },
        onBlind: (blindness: Blindness): void => { log(`blind at ${blindness.at}: ${blindness.saying}`); },
        onUnknownKind: (): void => { /* herdr has more events than we map; that is expected */ },
        onBeat: (): void => { /* the columns read the store; there is no separate heartbeat */ },
        onStatus: laneTurns({ hub, compactions: store.compactions, board: (): Board => box.informer?.current ?? emptyBoard(), now: () => Date.now() }),
    });
    box.informer = informer;
    const compaction = wireCompaction({ fleet, records: store.records, ledger: store.ledger, compactions: store.compactions, settling: hub, webs, recaps, informer, log, briefs: () => backends.brief(), recent: new LaneRecent(transcripts) });
    const retention = new InputRetention({ inputs: store.inputs, clock, days: (): number => loadConfig().keepInputDays, log });
    const curate = wireCurate({ store, curator: () => backends.curator(), log });
    return { informer, fleet, backends, extensions: loadExtensions(configGetter()), store, compaction, retention, curate };
}

/** Every second: beat, and hand the daemon what the columns and commands asked for since. */
function poll(pidfile: Pidfile, wired: Pick<Wired, 'store' | 'informer' | 'compaction' | 'curate'>): void {
    const { store, informer, compaction, curate } = wired;
    pidfile.beat();
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

/** The daemon's parts, or the exit code when it must not run: another daemon is alive (0), or the state is not usable (1). */
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
    const { informer, fleet, backends, extensions, store, retention } = booted;
    let stopping = false;
    const stop = (): void => {
        if (stopping) {
            return;
        }
        stopping = true;
        void shutDown(fleet, informer, log).finally(() => { store.close(); pidfile.release(process.pid); process.exit(0); });
    };
    process.on('SIGTERM', stop);
    process.on('SIGINT', stop);
    const restarted = store.compactions.interrupted(Date.now(), messagesOf().compaction.stage.restarted);
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
        informer.tick();
        retention.tick();
        void backends.refresh();
        void upkeep(extensions, log);
    }, RESYNC_MS).unref();
    await backends.refresh();
    log(`daemon ${process.pid} up, state in ${root}`);
    await informer.enterSubscription();
    await informer.run();
    pidfile.release(process.pid);
    return 0;
}

process.exitCode = await start();
