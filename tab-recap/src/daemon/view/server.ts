import type { Stats } from 'node:fs';
import { chmod, stat, unlink } from 'node:fs/promises';
import { createServer } from 'node:net';
import type { Server, Socket } from 'node:net';
import { BAR_TITLE, COLUMN_TITLE } from '#src/adapters/herdr/column-panes.ts';
import { parseLine, type Line, type Version } from '#src/daemon/slots.ts';
import type { FrameSource, Screen } from '#src/daemon/view/frames.ts';
import type { Connection, IntentSink } from '#src/daemon/view/intents.ts';
import { must } from '@stateforge-labs/session-ledger';
import { parseCount, type Count } from '@stateforge-labs/session-ledger';
import { parseTabId, type ScopeId } from '#src/recap/domain/ids.ts';
import type { Shown } from '@stateforge-labs/session-ledger';
import { parseText, type Text } from '@stateforge-labs/session-ledger';
import { coloured, plain, type Style } from '#src/recap/render/wrap.ts';
import { claimOwnedSocket } from '#src/daemon/view/socket-folder.ts';
import { LineSplitter, decodeClient, encode } from '#src/wire/view/codec.ts';
import type { Ignored, Malformed } from '#src/wire/view/codec.ts';
import { intentOf } from '#src/wire/view/keys.ts';
import { isLocal, scrolled } from '#src/daemon/view/scroll.ts';
import { PROTOCOL } from '#src/wire/view/protocol.ts';
import type { Bye, ClientMessage, FrameMessage, Hello, IntentMessage, Key, Role, StatusTexts, Tap, Welcome } from '#src/wire/view/protocol.ts';

export type SocketPath = Text;

export const parseSocketPath = (input: unknown): SocketPath => must(parseText(input));

export interface ViewServerOptions {
    readonly socketPath: SocketPath;
    readonly frames: FrameSource;
    readonly intents: IntentSink;
    readonly texts: () => StatusTexts;
    readonly version: Version;
    readonly log: (line: Line) => void;
}

export interface ViewServer {
    readonly connections: () => Count;
    readonly watching: (tab: ScopeId) => Shown;
    readonly refresh: () => void;
    readonly stop: (why: 'shutdown') => Promise<void>;
}

interface Session extends Connection {
    readonly socket: Socket;
    readonly style: Style;
    cols: Count;
    rows: Count;
    scroll: Count;
    shown: readonly Text[] | null;
}

type Geometry = Pick<Session, 'tab' | 'cols' | 'rows'>;

interface Hub {
    readonly options: ViewServerOptions;
    readonly live: Set<Socket>;
    readonly sessions: Map<Socket, Session>;
}

type Same = 'same' | 'changed';

type Resize = Extract<ClientMessage, { readonly t: 'resize' }>;

const ZERO: Count = must(parseCount(0));
const COLUMN: Text = must(parseText(COLUMN_TITLE));
const BAR: Text = must(parseText(BAR_TITLE));
const titleOf = (role: Role): Text => (role === 'bar' ? BAR : COLUMN);

const compareLines = (left: readonly Text[], right: readonly Text[]): Same =>
    left.length === right.length && left.every((line, index) => line === right[index]) ? 'same' : 'changed';

const screenOf = (session: Session): Screen => ({ role: session.role, tab: session.tab, cols: session.cols, rows: session.rows, style: session.style, scroll: session.scroll });

const isClient = (message: ClientMessage | Ignored | Malformed): message is ClientMessage => !('kind' in message);

const hangUp = (hub: Hub, socket: Socket, why: Bye['why']): void => {
    if (!hub.live.delete(socket)) {
        return;
    }
    hub.sessions.delete(socket);
    const bye: Bye = { t: 'bye', why, protocol: PROTOCOL, version: hub.options.version };
    socket.end(encode(bye), () => {
        socket.destroy();
    });
};

const frameOf = (hub: Hub, session: Session): FrameMessage | null => {
    const frame = hub.options.frames.lines(screenOf(session));
    session.scroll = frame.scroll;
    if (session.shown !== null && compareLines(session.shown, frame.lines) === 'same') {
        return null;
    }
    session.shown = frame.lines;
    return { t: 'frame', lines: frame.lines };
};

const paint = (hub: Hub, session: Session): void => {
    const frame = frameOf(hub, session);
    if (frame !== null) {
        session.socket.write(encode(frame));
    }
};

const act = (hub: Hub, session: Session, message: Key | Tap | IntentMessage): void => {
    const intent = intentOf(session.role, message);
    if (intent === null) {
        return;
    }
    if (isLocal(intent)) {
        session.scroll = scrolled(session, intent);
        paint(hub, session);
        return;
    }
    hub.options.intents(intent, session);
};

const resize = (hub: Hub, session: Session, message: Resize): void => {
    const cols = parseCount(message.cols);
    const rows = parseCount(message.rows);
    if (cols.kind === 'ok' && rows.kind === 'ok') {
        session.cols = cols.value;
        session.rows = rows.value;
        paint(hub, session);
    }
};

const newSession = (hub: Hub, socket: Socket, hello: Hello, geometry: Geometry): Session => ({
    role: hello.role,
    tab: geometry.tab,
    socket,
    style: hello.colour ? coloured : plain,
    cols: geometry.cols,
    rows: geometry.rows,
    scroll: ZERO,
    shown: null,
    close: () => {
        hangUp(hub, socket, 'closed');
    },
});

const greet = (hub: Hub, socket: Socket, message: ClientMessage | Ignored | Malformed): Session | null => {
    if (!isClient(message) || message.t !== 'hello') {
        hangUp(hub, socket, 'malformed');
        return null;
    }
    if (message.protocol !== PROTOCOL) {
        hangUp(hub, socket, 'protocol');
        return null;
    }
    const tab = parseTabId(message.tab);
    const cols = parseCount(message.cols);
    const rows = parseCount(message.rows);
    if (tab.kind === 'err' || cols.kind === 'err' || rows.kind === 'err') {
        hangUp(hub, socket, 'malformed');
        return null;
    }
    const session = newSession(hub, socket, message, { tab: tab.value, cols: cols.value, rows: rows.value });
    const welcome: Welcome = { t: 'welcome', protocol: PROTOCOL, version: hub.options.version, title: titleOf(message.role), texts: hub.options.texts() };
    socket.write(encode(welcome));
    hub.sessions.set(socket, session);
    paint(hub, session);
    return session;
};

const handle = (hub: Hub, socket: Socket, session: Session, message: ClientMessage): void => {
    switch (message.t) {
        case 'resize':
            resize(hub, session, message);
            return;
        case 'key':
        case 'tap':
        case 'intent':
            act(hub, session, message);
            return;
        case 'ping':
            socket.write(encode({ t: 'pong' }));
            return;
        case 'hello':
            return;
    }
};

const onMessage = (hub: Hub, socket: Socket, session: Session | null, message: ClientMessage | Ignored | Malformed): Session | null => {
    if (session === null) {
        return greet(hub, socket, message);
    }
    if (!isClient(message)) {
        if (message.kind === 'malformed') {
            hangUp(hub, socket, 'malformed');
        }
        return session;
    }
    handle(hub, socket, session, message);
    return session;
};

const accept = (hub: Hub, socket: Socket): void => {
    const splitter = new LineSplitter();
    let session: Session | null = null;
    hub.live.add(socket);
    socket.on('data', (chunk) => {
        for (const part of splitter.push(chunk)) {
            if (!hub.live.has(socket)) {
                return;
            }
            session = onMessage(hub, socket, session, typeof part === 'string' ? decodeClient(part) : part);
        }
    });
    socket.on('error', () => {
        hangUp(hub, socket, 'closed');
    });
    socket.on('close', () => {
        hub.live.delete(socket);
        hub.sessions.delete(socket);
    });
};

const listen = (server: Server, path: SocketPath): Promise<Error | null> => new Promise((resolve) => {
    server.once('error', (error: Error) => {
        resolve(error);
    });
    server.listen(path, () => {
        resolve(null);
    });
});

const stopAll = async (hub: Hub, server: Server, path: SocketPath, bound: Stats, why: 'shutdown'): Promise<void> => {
    const closed = new Promise<void>((resolve) => {
        server.close(() => {
            resolve();
        });
    });
    for (const socket of hub.live) {
        hangUp(hub, socket, why);
    }
    await closed;
    let same = false;
    try {
        same = (await stat(path)).ino === bound.ino;
    } catch {
        same = false;
    }
    if (same) {
        await unlink(path).catch(() => undefined);
    }
};

export async function startViewServer(options: ViewServerOptions): Promise<ViewServer | null> {
    const claim = await claimOwnedSocket(options.socketPath);
    if (claim.kind !== 'free') {
        options.log(parseLine(`view socket not free: ${claim.kind}`));
        return null;
    }
    const hub: Hub = { options, live: new Set(), sessions: new Map() };
    const server = createServer((socket) => {
        accept(hub, socket);
    });
    const failure = await listen(server, options.socketPath);
    if (failure !== null) {
        options.log(parseLine(`view socket not bound: ${failure.message}`));
        return null;
    }
    server.on('error', (error: Error) => {
        options.log(parseLine(`view server: ${error.message}`));
    });
    await chmod(options.socketPath, 0o600);
    const bound = await stat(options.socketPath);
    return {
        connections: () => must(parseCount(hub.sessions.size)),
        watching: (tab: ScopeId): Shown => ([...hub.sessions.values()].some((session) => session.tab === tab) ? 'shown' : 'hidden'),
        refresh: () => { for (const session of hub.sessions.values()) { paint(hub, session); } },
        stop: (why) => stopAll(hub, server, options.socketPath, bound, why),
    };
}
