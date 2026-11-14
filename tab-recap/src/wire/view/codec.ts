import { LIMITS } from './protocol.ts';
import type { Bye, ClientMessage, DaemonMessage, FrameMessage, Hello, IntentMessage, Key, Ping, Pong, Resize, StatusTexts, Tap, Welcome } from './protocol.ts';

export interface Malformed { readonly kind: 'malformed'; readonly why: string }
export interface Ignored { readonly kind: 'ignored'; readonly t: string }

interface Loose { readonly [name: string]: unknown }
interface Tagged extends Loose { readonly t: string }
type Message = ClientMessage | DaemonMessage;
type ClientLine = ClientMessage;
type DaemonLine = DaemonMessage;
type HelloHead = Pick<Hello, 't' | 'protocol' | 'version' | 'role' | 'tab'>;
type HelloTail = Pick<Hello, 'pane' | 'cols' | 'rows' | 'colour'>;
type HelloLine = Hello;
type ResizeLine = Resize;
type KeyLine = Key;
type TapLine = Tap;
type IntentLine = IntentMessage;
type PingLine = Ping;
type WelcomeLine = Welcome;
type TextsLine = StatusTexts;
type Lines = FrameMessage['lines'];
type FrameLine = FrameMessage;
type PongLine = Pong;
type ByeLine = Bye;
type ClientGuard = (value: unknown) => value is ClientLine;
type DaemonGuard = (value: unknown) => value is DaemonLine;

const TEXTS_ORDER = ['connecting', 'down', 'downHint', 'mismatch'] as const;

const ORDER: Readonly<Record<Message['t'], readonly string[]>> = {
    hello: ['t', 'protocol', 'version', 'role', 'tab', 'pane', 'cols', 'rows', 'colour'],
    resize: ['t', 'cols', 'rows'],
    key: ['t', 'key'],
    tap: ['t', 'col', 'row'],
    intent: ['t', 'intent'],
    ping: ['t'],
    welcome: ['t', 'protocol', 'version', 'title', 'texts', ...TEXTS_ORDER],
    frame: ['t', 'lines'],
    pong: ['t'],
    bye: ['t', 'why', 'protocol', 'version'],
};

const ROLES: ReadonlySet<unknown> = new Set(['column', 'modal', 'bar']);
const INTENTS: ReadonlySet<unknown> = new Set(['refresh', 'hide', 'show-modal', 'compact', 'configure']);
const WHYS: ReadonlySet<unknown> = new Set(['shutdown', 'protocol', 'malformed', 'closed']);

const isLoose = (value: unknown): value is Loose => typeof value === 'object' && value !== null && !Array.isArray(value);

const isTagged = (value: unknown): value is Tagged => isLoose(value) && typeof value['t'] === 'string';

const isHelloHead = (value: unknown): value is HelloHead =>
    isLoose(value) && value['t'] === 'hello' && Number.isInteger(value['protocol']) && typeof value['version'] === 'string' && ROLES.has(value['role']) && typeof value['tab'] === 'string';

const isHelloTail = (value: unknown): value is HelloTail =>
    isLoose(value) && (value['pane'] === null || typeof value['pane'] === 'string') && Number.isInteger(value['cols']) && Number.isInteger(value['rows']) && typeof value['colour'] === 'boolean';

const isHello = (value: unknown): value is HelloLine => isHelloHead(value) && isHelloTail(value);

const isResize = (value: unknown): value is ResizeLine => isLoose(value) && value['t'] === 'resize' && Number.isInteger(value['cols']) && Number.isInteger(value['rows']);

const isKey = (value: unknown): value is KeyLine => isLoose(value) && value['t'] === 'key' && typeof value['key'] === 'string';

const isTap = (value: unknown): value is TapLine => isLoose(value) && value['t'] === 'tap' && Number.isInteger(value['col']) && Number.isInteger(value['row']);

const isIntent = (value: unknown): value is IntentLine => isLoose(value) && value['t'] === 'intent' && INTENTS.has(value['intent']);

const isPing = (value: unknown): value is PingLine => isLoose(value) && value['t'] === 'ping';

const isTexts = (value: unknown): value is TextsLine => isLoose(value) && TEXTS_ORDER.every((name) => typeof value[name] === 'string');

const isWelcome = (value: unknown): value is WelcomeLine =>
    isLoose(value) && value['t'] === 'welcome' && Number.isInteger(value['protocol']) && typeof value['version'] === 'string' && typeof value['title'] === 'string' && isTexts(value['texts']);

const isLines = (value: unknown): value is Lines => Array.isArray(value) && value.every((line) => typeof line === 'string');

const isFrame = (value: unknown): value is FrameLine => isLoose(value) && value['t'] === 'frame' && isLines(value['lines']);

const isPong = (value: unknown): value is PongLine => isLoose(value) && value['t'] === 'pong';

const isBye = (value: unknown): value is ByeLine =>
    isLoose(value) && value['t'] === 'bye' && WHYS.has(value['why']) && Number.isInteger(value['protocol']) && typeof value['version'] === 'string';

const CLIENT: ReadonlyMap<unknown, ClientGuard> = new Map<unknown, ClientGuard>([
    ['hello', isHello], ['resize', isResize], ['key', isKey], ['tap', isTap], ['intent', isIntent], ['ping', isPing],
]);

const DAEMON: ReadonlyMap<unknown, DaemonGuard> = new Map<unknown, DaemonGuard>([
    ['welcome', isWelcome], ['frame', isFrame], ['pong', isPong], ['bye', isBye],
]);

const NOT_JSON: Malformed = { kind: 'malformed', why: 'json' };
const NOT_MESSAGE: Malformed = { kind: 'malformed', why: 'shape' };
const BAD_FIELD: Malformed = { kind: 'malformed', why: 'field' };
const TOO_LONG: Malformed = { kind: 'malformed', why: 'too-long' };

export function encode(message: ClientMessage | DaemonMessage): string {
    return `${JSON.stringify(message, [...ORDER[message.t]])}\n`;
}

export function decodeClient(line: string): ClientMessage | Ignored | Malformed {
    let value: unknown = NOT_JSON;
    try {
        value = JSON.parse(line);
    } catch {
        return NOT_JSON;
    }
    if (!isTagged(value)) {
        return NOT_MESSAGE;
    }
    const guard = CLIENT.get(value.t);
    if (guard === undefined) {
        return { kind: 'ignored', t: value.t };
    }
    return guard(value) ? value : BAD_FIELD;
}

export function decodeDaemon(line: string): DaemonMessage | Ignored | Malformed {
    let value: unknown = NOT_JSON;
    try {
        value = JSON.parse(line);
    } catch {
        return NOT_JSON;
    }
    if (!isTagged(value)) {
        return NOT_MESSAGE;
    }
    const guard = DAEMON.get(value.t);
    if (guard === undefined) {
        return { kind: 'ignored', t: value.t };
    }
    return guard(value) ? value : BAD_FIELD;
}

export class LineSplitter {
    private pending: Buffer = Buffer.alloc(0);

    private dropping = false;

    push(chunk: Buffer): readonly (string | Malformed)[] {
        const out: (string | Malformed)[] = [];
        let buffer = Buffer.concat([this.pending, chunk]);
        for (let end = buffer.indexOf(0x0a); end >= 0; end = buffer.indexOf(0x0a)) {
            const line = buffer.subarray(0, end);
            buffer = buffer.subarray(end + 1);
            if (this.dropping) {
                this.dropping = false;
            } else {
                out.push(line.length > LIMITS.lineBytes ? TOO_LONG : line.toString('utf8'));
            }
        }
        if (buffer.length > LIMITS.lineBytes && !this.dropping) {
            out.push(TOO_LONG);
            this.dropping = true;
        }
        this.pending = this.dropping ? Buffer.alloc(0) : buffer;
        return out;
    }
}
