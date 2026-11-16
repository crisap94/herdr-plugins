import { chmod, stat, unlink } from 'node:fs/promises';
import { createServer } from 'node:net';
import type { Server, Socket } from 'node:net';
import { BAR_TITLE, COLUMN_TITLE } from '#src/adapters/herdr/column-panes.ts';
import type { Line, Version } from '#src/daemon/slots.ts';
import type { FrameSource, Screen } from '#src/daemon/view/frames.ts';
import { type Connection, type IntentSink } from '#src/daemon/view/intents.ts';
import { must } from '#src/protocol/result.ts';
import { brand, type Brand } from '#src/recap/domain/brand.ts';
import { parseCount, type Count } from '#src/recap/domain/count.ts';
import { parseTabId, type TabId } from '#src/recap/domain/ids.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';
import { coloured, plain, type Style } from '#src/recap/render/wrap.ts';
import { claimSocket } from '#src/wire/socket-claim.ts';
import { LineSplitter, decodeClient, encode } from '#src/wire/view/codec.ts';
import type { Ignored, Malformed } from '#src/wire/view/codec.ts';
import { intentOf } from '#src/wire/view/keys.ts';
import { PROTOCOL } from '#src/wire/view/protocol.ts';
import type { Bye, ClientMessage, FrameMessage, IntentMessage, Key, Role, StatusTexts, Tap, Welcome } from '#src/wire/view/protocol.ts';

export type SocketPath = Brand<string, 'SocketPath'>;

export const parseSocketPath = (input: unknown): SocketPath => brand<string, 'SocketPath'>(String(input));

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

type Same = 'same' | 'changed';

const ZERO: Count = must(parseCount(0));
const LAST: Count = must(parseCount(Number.MAX_SAFE_INTEGER));
const COLUMN: Text = must(parseText(COLUMN_TITLE));
const BAR: Text = must(parseText(BAR_TITLE));
const MIN_PAGE = 1;


const titleOf = (role: Role): Text => (role === 'bar' ? BAR : COLUMN);

const compareLines = (left: readonly Text[], right: readonly Text[]): Same =>
    left.length === right.length && left.every((line, index) => line === right[index]) ? 'same' : 'changed';

const screenOf = (session: Session): Screen => ({ role: session.role, tab: session.tab, cols: session.cols, rows: session.rows, style: session.style, scroll: session.scroll });

const isClient = (message: ClientMessage | Ignored | Malformed): message is ClientMessage => !('kind' in message);

export async function startViewServer(options: ViewServerOptions): Promise<ViewServer | null> {
    const path = options.socketPath;
    const claim = await claimSocket(path);
    if (claim.kind !== 'free') {
        options.log(brand<string, 'LogLine'>(`view socket not free: ${claim.kind}`));
        return null;
    }
    const { version } = options;
    const live = new Set<Socket>();
    const sessions = new Map<Socket, Session>();

    const end = (socket: Socket, why: Bye['why']): void => {
        if (!live.delete(socket)) {
            return;
        }
        sessions.delete(socket);
        const bye: Bye = { t: 'bye', why, protocol: PROTOCOL, version };
        socket.end(encode(bye), () => {
            socket.destroy();
        });
    };

    const frameOf = (session: Session): FrameMessage | null => {
        const frame = options.frames.lines(screenOf(session));
        session.scroll = frame.scroll;
        if (session.shown !== null && compareLines(session.shown, frame.lines) === 'same') {
            return null;
        }
        session.shown = frame.lines;
        return { t: 'frame', lines: frame.lines };
    };

    const paint = (session: Session): void => {
        const frame = frameOf(session);
        if (frame !== null) {
            session.socket.write(encode(frame));
        }
    };

    const act = (session: Session, message: Key | Tap | IntentMessage): void => {
        const intent = intentOf(session.role, message);
        if (intent === null) {
            return;
        }
        if (intent.kind === 'scroll') {
            session.scroll = must(parseCount(Math.min(Math.max(0, Number(session.scroll) + intent.lines), Number.MAX_SAFE_INTEGER)));
            paint(session);
            return;
        }
        if (intent.kind === 'page') {
            session.scroll = must(parseCount(Math.min(Math.max(0, Number(session.scroll) + intent.pages * Math.max(MIN_PAGE, Number(session.rows) - 2)), Number.MAX_SAFE_INTEGER)));
            paint(session);
            return;
        }
        if (intent.kind === 'jump') {
            session.scroll = intent.to === 'top' ? ZERO : LAST;
            paint(session);
            return;
        }
        options.intents(intent, session);
    };

    const greet = (socket: Socket, message: ClientMessage | Ignored | Malformed): Session | null => {
        if (!isClient(message) || message.t !== 'hello') {
            end(socket, 'malformed');
            return null;
        }
        if (message.protocol !== PROTOCOL) {
            end(socket, 'protocol');
            return null;
        }
        const tab = parseTabId(message.tab);
        const cols = parseCount(message.cols);
        const rows = parseCount(message.rows);
        if (tab.kind === 'err' || cols.kind === 'err' || rows.kind === 'err') {
            end(socket, 'malformed');
            return null;
        }
        const session: Session = {
            role: message.role,
            tab: tab.value,
            socket,
            style: message.colour ? coloured : plain,
            cols: cols.value,
            rows: rows.value,
            scroll: ZERO,
            shown: null,
            close: () => {
                end(socket, 'closed');
            },
        };
        const welcome: Welcome = { t: 'welcome', protocol: PROTOCOL, version, title: titleOf(message.role).valueOf(), texts: options.texts() };
        socket.write(encode(welcome));
        sessions.set(socket, session);
        paint(session);
        return session;
    };

    const onMessage = (socket: Socket, session: Session | null, message: ClientMessage | Ignored | Malformed): Session | null => {
        if (session === null) {
            return greet(socket, message);
        }
        if (!isClient(message)) {
            if (message.kind === 'malformed') {
                end(socket, 'malformed');
            }
            return session;
        }
        switch (message.t) {
            case 'resize': {
                const cols = parseCount(message.cols);
                const rows = parseCount(message.rows);
                if (cols.kind === 'ok' && rows.kind === 'ok') {
                    session.cols = cols.value;
                    session.rows = rows.value;
                    paint(session);
                }
                return session;
            }
            case 'key':
            case 'tap':
            case 'intent':
                act(session, message);
                return session;
            case 'ping':
                socket.write(encode({ t: 'pong' }));
                return session;
            case 'hello':
                return session;
        }
    };

    const accept = (socket: Socket): void => {
        const splitter = new LineSplitter();
        let session: Session | null = null;
        live.add(socket);
        socket.on('data', (chunk) => {
            for (const part of splitter.push(chunk)) {
                if (!live.has(socket)) {
                    return;
                }
                const message = typeof part === 'string' ? decodeClient(part) : part;
                session = onMessage(socket, session, message);
            }
        });
        socket.on('error', () => {
            end(socket, 'closed');
        });
        socket.on('close', () => {
            live.delete(socket);
            sessions.delete(socket);
        });
    };

    const server: Server = createServer(accept);
    const listening = await new Promise<Error | null>((resolve) => {
        server.once('error', (error: Error) => {
            resolve(error);
        });
        server.listen(path, () => {
            resolve(null);
        });
    });
    if (listening !== null) {
        options.log(brand<string, 'LogLine'>(`view socket not bound: ${listening.message}`));
        return null;
    }
    server.on('error', (error: Error) => {
        options.log(brand<string, 'LogLine'>(`view server: ${error.message}`));
    });
    await chmod(path, 0o600);
    const bound = (await stat(path)).ino;

    const refresh = (): void => {
        for (const session of sessions.values()) {
            paint(session);
        }
    };

    const stop = async (why: 'shutdown'): Promise<void> => {
        const closed = new Promise<void>((resolve) => {
            server.close(() => {
                resolve();
            });
        });
        for (const socket of [...live]) {
            end(socket, why);
        }
        await closed;
        let same = false;
        try {
            same = (await stat(path)).ino === bound;
        } catch {
            same = false;
        }
        if (same) {
            await unlink(path).catch(() => undefined);
        }
    };

    return { connections: () => must(parseCount(sessions.size)), refresh, stop };
}
