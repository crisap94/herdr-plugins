import type { Mode, Running, SlotContext } from '../slots.ts';
import type { GlowCache, GlowSpawn } from '../view/glow-cache.ts';
import type { IntentSink, Launch } from '../view/intents.ts';
import type { CompactStart } from '#src/recap/application/compact-start.ts';
import type { Done } from '#src/ports/columns.ts';
import type { PaneId, TabId } from '#src/recap/domain/ids.ts';
import { textOf } from '#src/recap/domain/text.ts';

export const defaultOn: Mode = 'on';

export type ViewContext = Pick<SlotContext, 'root' | 'version' | 'store' | 'observe' | 'clock' | 'log' | 'viewers'>;

const glowFor = async (): Promise<GlowCache> => {
    const processes = await import('node:child_process');
    const glow = await import('../view/glow-cache.ts');
    const text = await import('#src/recap/domain/text.ts');
    const run: GlowSpawn = async (args, input) => {
        try {
            const child = processes.spawn('glow', [...args], { timeout: 5000 });
            const closed = new Promise<number | null>((resolve) => {
                child.once('close', resolve);
                child.once('error', () => resolve(null));
            });
            child.stdin.end(input);
            let output = '';
            for await (const chunk of child.stdout) {
                output += String(chunk);
            }
            const code = await closed;
            const parsed = code === 0 ? text.parseText(output) : null;
            return parsed !== null && parsed.kind === 'ok' ? parsed.value : null;
        } catch {
            return null;
        }
    };
    return glow.glowCache(run);
};

const launcherFor = async (context: ViewContext): Promise<(launch: Launch) => void> => {
    const processes = await import('node:child_process');
    const command = await import('#src/column/command.ts');
    const intents = await import('../view/intents.ts');
    const slots = await import('../slots.ts');
    return (launch): void => {
        const child = processes.spawn(process.execPath, [command.COMMAND_LAUNCHER, launch.kind], { detached: true, stdio: 'ignore', env: { ...process.env, ...intents.launchEnv(launch) } });
        child.on('error', (error: Error) => {
            context.log(slots.parseLine(`view launch: ${error.message}`));
        });
        child.unref();
    };
};

const compactFor = async (context: ViewContext): Promise<CompactStart> => {
    const herdr = await import('#src/adapters/herdr/fleet.ts');
    return {
        askNote(tab: TabId, pane: PaneId | null): Promise<Done> {
            return new herdr.HerdrFleet(textOf(context.root)).agents().askNote(tab, pane);
        },
        queue(request): Done {
            context.store.requests.requestCompact(request);
            return { kind: 'done' };
        },
    };
};

const intentsFor = async (context: ViewContext): Promise<IntentSink> => {
    const intents = await import('../view/intents.ts');
    const herdr = await import('#src/adapters/herdr/fleet.ts');
    const config = await import('../config.ts');
    return intents.runIntent({
        observe: context.observe,
        show: (tab: TabId): Promise<Done> => new herdr.HerdrFleet(textOf(context.root)).show(tab),
        compact: await compactFor(context),
        compactNote: () => config.loadConfig().compactNote,
        launch: await launcherFor(context),
        log: context.log,
    });
};

export const slot = {
    start: async (context: ViewContext): Promise<Running> => {
        const server = await import('../view/server.ts');
        const frames = await import('../view/frames.ts');
        const texts = await import('../view/texts.ts');
        const config = await import('../config.ts');
        const slots = await import('../slots.ts');
        const paths = await import('#src/wire/paths.ts');
        const cache = await glowFor();
        const source = frames.frameSource({ store: context.store, glow: cache, clock: context.clock, version: () => context.version, config: config.loadConfig });
        const started = await server.startViewServer({
            socketPath: server.parseSocketPath(paths.viewSocketPath(context.root)),
            frames: source,
            intents: await intentsFor(context),
            texts: () => texts.viewTexts(config.loadConfig().locale),
            version: context.version ?? slots.parseVersion('unknown'),
            log: context.log,
        });
        if (started === null) {
            return { stop: (): void => undefined };
        }
        const detach = context.viewers.attach(started.watching);
        const unsubscribe = cache.onReady(() => {
            started.refresh();
        });
        return {
            poll: (): void => {
                started.refresh();
            },
            stop: async (): Promise<void> => {
                unsubscribe();
                detach();
                await started.stop('shutdown');
            },
        };
    },
};
