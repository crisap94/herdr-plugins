// The composition root and the loop. Started detached by `bin/tab-recap.ts start`.
import { ClaudeTranscripts } from '#src/adapters/claude-transcripts.ts';
import { CodexTranscripts } from '#src/adapters/codex-transcripts.ts';
import { OpencodeTranscripts } from '#src/adapters/opencode-transcripts.ts';
import { ScreenTranscripts } from '#src/adapters/screen-transcripts.ts';
import { FsRecapStore } from '#src/adapters/fs-recap-store.ts';
import { GitLaneRepo } from '#src/adapters/git-lane-repo.ts';
import { HerdrFleet } from '#src/adapters/herdr-fleet.ts';
import { PathHarnesses } from '#src/adapters/path-harnesses.ts';
import { Pidfile } from '#src/adapters/pidfile.ts';
import { codeVersion } from '#src/adapters/plugin-version.ts';
import { SystemClock } from '#src/adapters/system-clock.ts';
import type { Summarizer } from '#src/ports/summarizer.ts';
import { LivePrompts } from '#src/recap/application/live-prompts.ts';
import { Dispatch } from '#src/recap/application/dispatch.ts';
import { Informer } from '#src/recap/application/informer.ts';
import type { Blindness } from '#src/recap/application/informer.ts';
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
import { loadExtensions } from '#src/extensions/load.ts';
import { configGetter, loadConfig, stateDir } from './config.ts';
import { ANY_KIND } from '#src/recap/domain/policy.ts';
import { upkeep } from './upkeep.ts';

const REQUEST_POLL_MS = 1000;
const RESYNC_MS = 60_000;
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
    readonly store: FsRecapStore;
}

/** A lane is read from its screen only for the kinds the operator listed (re-read on every use). */
function wantsScreen(agent: string): boolean {
    const { screenAgents } = loadConfig();
    return screenAgents.includes(ANY_KIND) || screenAgents.includes(agent);
}

function wire(root: string): Wired {
    const config = loadConfig();
    const fleet = new HerdrFleet(root);
    const store = new FsRecapStore(root, codeVersion());
    const clock = new SystemClock();
    const backends = new Backends(root, { herdr: fleet, path: new PathHarnesses(AUTO_ORDER) }, fleet, log);
    const transcripts = [new ClaudeTranscripts(), new CodexTranscripts(), new OpencodeTranscripts(), new ScreenTranscripts(fleet, wantsScreen)];
    const recaps = new RecapJob({
        transcripts,
        store, clock, log, repos: new GitLaneRepo(clock),
        summarizer: (): Summarizer => backends.summarizer(),
        language: (): string => loadConfig().recapLanguage,
    });
    const box: { informer: Informer | null } = { informer: null };
    const dispatch = new Dispatch({
        columns: fleet, store, recaps, log, prompts: new LivePrompts(transcripts),
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
    });
    box.informer = informer;
    return { informer, fleet, backends, extensions: loadExtensions(configGetter()), store };
}

async function start(): Promise<number> {
    const root = stateDir();
    const pidfile = new Pidfile(root);
    const other = pidfile.alive();
    if (other !== null && other !== process.pid) {
        log(`another daemon is running (pid ${other})`);
        return 0;
    }
    pidfile.claim(process.pid, codeVersion());
    pidfile.beat();
    const { informer, fleet, backends, extensions, store } = wire(root);
    let stopping = false;
    const stop = (): void => {
        if (stopping) {
            return;
        }
        stopping = true;
        void shutDown(fleet, informer, log).finally(() => { pidfile.release(process.pid); process.exit(0); });
    };
    process.on('SIGTERM', stop);
    process.on('SIGINT', stop);
    informer.push({ kind: 'hidden-restored', state: store.readHidden() });
    setInterval(() => {
        pidfile.beat();
        for (const tab of store.takeRequests()) {
            informer.push({ kind: 'requested', tab });
        }
        for (const asked of store.takeVisibility()) {
            informer.push({ kind: 'visibility', target: asked.target === 'all' ? 'all' : { tab: tabId(asked.target) }, hidden: asked.hidden });
        }
    }, REQUEST_POLL_MS).unref();
    setInterval(() => {
        informer.tick();
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
