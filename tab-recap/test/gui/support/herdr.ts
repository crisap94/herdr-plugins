export interface Tab {
    id: string;
    name: string;
    status: string | null;
}

export interface Space {
    id: string;
    name: string;
    tabs: Tab[];
}

export interface Agent {
    tab: string;
    title: string;
    address: string;
    status: string;
}

export interface Pane {
    pane: string;
    tab: string;
    terminal: string | null;
    title: string;
    status: string | null;
}

export interface ExecCall {
    readonly command: string;
    readonly argv: readonly string[];
}

export interface Overlay {
    readonly id: string;
    readonly spec: Record<string, unknown>;
}

export interface Notice {
    readonly title: string;
    readonly body: string;
}

export interface Reply {
    code: number;
    stdout: string;
    stderr: string;
}

export const STATE_DIR = '/state';
export const GUI_DIR = `${STATE_DIR}/gui`;
const BIN_ENV = 'TAB_RECAP_BIN';
const STATE_ENV = 'TAB_RECAP_STATE';
const PRINTENV = 'printenv';

export const DARK: Record<string, string> = {
    background: '#0f1115', chrome: '#14171c', surface: '#181b21', raised: '#1e222a', hover: '#262b35', selected: '#2a3140', border: '#2c323d',
    foreground: '#e6e8ee', muted: '#a3a9b8', dim: '#6f7687', accent: '#5b9dff', accent_foreground: '#08101f',
    blocked: '#ef5a5a', working: '#e0a43a', done: '#4cc38a', ansi2: '#4cc38a', idle: '#7a8191', unknown: '#8a8fa0', ansi5: '#a77bf3',
};

export const LIGHT: Record<string, string> = {
    background: '#f6f7f9', chrome: '#eceef2', surface: '#ffffff', raised: '#fbfbfd', hover: '#eef0f5', selected: '#dde6f8', border: '#d6dae3',
    foreground: '#1b1e25', muted: '#555c6b', dim: '#8a90a0', accent: '#2563eb', accent_foreground: '#ffffff',
    blocked: '#d93636', working: '#b7791f', done: '#1f9d63', ansi2: '#1f9d63', idle: '#7a8191', unknown: '#8a8fa0', ansi5: '#7c3aed',
};

export interface World {
    spaces: Space[];
    agents: Agent[];
    panes: Pane[];
    focusedTab: string | null;
    light: boolean;
    props: Record<string, unknown> | null;
    files: Map<string, string>;
    env: Map<string, string>;
    execLog: ExecCall[];
    runLog: { name: string; args: unknown }[];
    overlays: Overlay[];
    closed: string[];
    notices: Notice[];
    noticeSpecs: Record<string, unknown>[];
    shared: Map<string, unknown>;
    sharedWrites: number;
    commandWaiters: ((name: string) => void)[];
    watchWaiters: (() => void)[];
    execReply: (command: string, argv: readonly string[]) => Reply | null;
    now: number;
    sequence: number;
    failClose: boolean;
}

export const NOW = Date.parse('2026-11-08T12:00:00Z');

function fresh(): World {
    return {
        spaces: [], agents: [], panes: [], focusedTab: null, light: false, props: null, files: new Map(), env: new Map([[STATE_ENV, STATE_DIR]]),
        execLog: [], runLog: [], overlays: [], closed: [], notices: [], noticeSpecs: [], shared: new Map(), sharedWrites: 0, commandWaiters: [], watchWaiters: [],
        execReply: () => null, now: NOW, sequence: 0, failClose: false,
    };
}

export const world: World = fresh();

export function reset(): void {
    Object.assign(world, fresh());
}

export const command = (name: string): void => {
    world.commandWaiters.shift()?.(name);
};

export const touch = (): void => {
    const waiting = world.watchWaiters.splice(0);
    waiting.forEach((release) => release());
};

export function exec(commandName: string, argv: string[] = []): Promise<Reply> {
    world.execLog.push({ command: commandName, argv });
    if (!Array.isArray(argv)) {
        return Promise.reject(new Error('argv must be an array'));
    }
    if (commandName === PRINTENV) {
        const value = world.env.get(argv[0] ?? '');
        return Promise.resolve(value === undefined ? { code: 1, stdout: '', stderr: '' } : { code: 0, stdout: `${value}\n`, stderr: '' });
    }
    try {
        return Promise.resolve(world.execReply(commandName, argv) ?? { code: 0, stdout: '', stderr: '' });
    } catch (failure) {
        return Promise.reject(failure);
    }
}

export const home = (): string => '/home/test';
export const theme = (): Record<string, string> => (world.light ? LIGHT : DARK);
export const spaces = (): Space[] => world.spaces;
export const agents = (): Agent[] => world.agents;
export const panes = (): Pane[] => world.panes;
export const props = (): Record<string, unknown> | null => world.props;
export const focused = (): { tab: string } | null => (world.focusedTab ? { tab: world.focusedTab } : null);
export const shared = (key: string): unknown => world.shared.get(key) ?? null;
export function setShared(key: string, value: unknown): null {
    world.shared.set(key, value);
    world.sharedWrites += 1;
    return null;
}
export function run(name: string, args: unknown): null {
    world.runLog.push({ name, args });
    return null;
}
export function openOverlay(spec: Record<string, unknown>): string {
    world.sequence += 1;
    const id = `overlay-${world.sequence}`;
    world.overlays.push({ id, spec });
    return id;
}
export const launched = (index: number): Record<string, unknown> => world.overlays.at(index)?.spec ?? {};
export function closeOverlay(id: string): null {
    if (world.failClose) {
        throw new Error('overlay is gone');
    }
    world.closed.push(id);
    return null;
}
export function notify(spec: Record<string, unknown>): string {
    world.noticeSpecs.push(spec);
    world.notices.push({ title: String(spec['title']), body: String(spec['body']) });
    return 'notice';
}
export const readTextFile = (path: string): Promise<string | null> => Promise.resolve(world.files.get(path) ?? null);
export const nextCommand = (): Promise<string> => new Promise((release) => { world.commandWaiters.push(release); });
export const watchFolder = (): Promise<string[]> => new Promise((release) => { world.watchWaiters.push(() => release([])); });
export const BIN_NAME = BIN_ENV;
