import { StringDecoder } from 'node:string_decoder';
import { join } from 'node:path';
import { err, must, ok, type Result } from '../kernel/result.ts';
import { brand, type Brand } from '../kernel/brand.ts';
import { parseCount, type Count } from '../kernel/count.ts';
import { duration, type Duration } from '../kernel/time.ts';
import { parseNonEmptyText, parseText, type NonEmptyText, type Text } from '../kernel/text.ts';
import { isFields } from '../kernel/fields.ts';
import type { ParseFailure } from '../kernel/parse-failure.ts';
import { HC_LINE_CAP, HC_DEFAULT_SESSION, HC_RUNTIME_ENV, HC_RUN_ROOT, HC_SESSION_ENV, HC_SOCKET_ENV, HC_SOCKET_FOLDER, HC_SOCKET_SUFFIX } from './constants.ts';

export type HcCallId = Brand<number, 'HcCallId'>;
export type RpcCode = Brand<number, 'RpcCode'>;
export type WireLine = Brand<string, 'WireLine'>;
export type WireChunk = Brand<Buffer, 'WireChunk'>;
export type SocketPath = Brand<string, 'SocketPath'>;
export type HcPayload = Brand<object, 'HcPayload'>;
export type HcParams = Brand<object, 'HcParams'>;
export type HcTransport = Brand<string, 'HcTransport'>;

export interface HcSnapshot {
    readonly seq: Count;
    readonly terminals: readonly HcPayload[];
}

export interface HcCoreHello {
    readonly version: Text;
    readonly methods: readonly NonEmptyText[];
    readonly generation: Count;
}

export interface HcReply { readonly kind: 'reply'; readonly id: HcCallId; readonly result: HcPayload }
export interface HcOdd { readonly kind: 'odd'; readonly id: HcCallId }
export interface HcFault { readonly kind: 'fault'; readonly id: HcCallId; readonly code: RpcCode; readonly reason: Text; readonly message: Text }
export interface HcEvent { readonly kind: 'event'; readonly seq: Count; readonly terminal: NonEmptyText | null; readonly type: NonEmptyText; readonly data: HcPayload }
export interface HcHeartbeat { readonly kind: 'heartbeat'; readonly seq: Count }
export interface HcMissed { readonly kind: 'missed'; readonly snapshot: HcSnapshot }

export type HcNotification = HcEvent | HcHeartbeat | HcMissed;
export type HcCoreMessage = HcReply | HcOdd | HcFault | HcNotification;

const EMPTY = must(parseText(''));
const NO_DATA: HcPayload = must(parseHcPayload({}));

export function parseHcPayload(input: unknown): Result<HcPayload, ParseFailure> {
    return typeof input === 'object' && input !== null ? ok(brand<object, 'HcPayload'>(input)) : err({ kind: 'not-a-row' });
}

export function parseHcParams(input: unknown): Result<HcParams, ParseFailure> {
    return typeof input === 'object' && input !== null ? ok(brand<object, 'HcParams'>(input)) : err({ kind: 'not-a-row' });
}

export function parseHcTransport(input: unknown): Result<HcTransport, ParseFailure> {
    const text = parseNonEmptyText(input);
    return text.kind === 'err' ? text : ok(brand<string, 'HcTransport'>(text.value.trim().toLowerCase()));
}

export function parseWireChunk(input: unknown): Result<WireChunk, ParseFailure> {
    return Buffer.isBuffer(input) ? ok(brand<Buffer, 'WireChunk'>(input)) : err({ kind: 'not-a-row' });
}

export function parseWireLine(input: unknown): Result<WireLine, ParseFailure> {
    const text = parseText(input);
    return text.kind === 'err' ? text : ok(brand<string, 'WireLine'>(text.value));
}

export function parseSocketPath(input: unknown): Result<SocketPath, ParseFailure> {
    const text = parseNonEmptyText(input);
    return text.kind === 'err' ? text : ok(brand<string, 'SocketPath'>(text.value));
}

export function parseHcCallId(input: unknown): Result<HcCallId, ParseFailure> {
    const count = parseCount(input);
    return count.kind === 'err' ? count : ok(brand<number, 'HcCallId'>(count.value));
}

export function parseRpcCode(input: unknown): Result<RpcCode, ParseFailure> {
    if (typeof input !== 'number') {
        return err({ kind: 'not-a-number' });
    }
    return Number.isInteger(input) ? ok(brand<number, 'RpcCode'>(input)) : err({ kind: 'not-an-integer' });
}

export function encodeHcCoreRequest(id: HcCallId, method: NonEmptyText, params: HcParams): WireLine {
    return must(parseWireLine(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`));
}

export class HcCoreLines {
    private readonly decoder = new StringDecoder('utf8');
    private readonly overrun: () => void;
    private readonly cap: Count;
    private rest: Text = EMPTY;

    constructor(overrun: () => void = (): void => undefined, cap: Count = HC_LINE_CAP) {
        this.overrun = overrun;
        this.cap = cap;
    }

    feed(chunk: WireChunk): readonly HcPayload[] {
        const fresh = this.decoder.write(chunk);
        const cut = fresh.lastIndexOf('\n');
        const text = this.rest + (cut < 0 ? fresh : fresh.slice(0, cut));
        if (text.length > this.cap) {
            this.rest = EMPTY;
            this.overrun();
            return [];
        }
        if (cut < 0) {
            this.rest = must(parseText(text));
            return [];
        }
        this.rest = must(parseText(fresh.slice(cut + 1)));
        const found: HcPayload[] = [];
        for (const line of text.split('\n')) {
            try {
                const parsed = parseHcPayload(JSON.parse(line));
                if (parsed.kind === 'ok') {
                    found.push(parsed.value);
                }
            } catch {
                continue;
            }
        }
        return found;
    }
}

export function hcCoreSocketPath(): SocketPath {
    const direct = parseSocketPath(process.env[HC_SOCKET_ENV]);
    if (direct.kind === 'ok') {
        return direct.value;
    }
    const runtime = parseNonEmptyText(process.env[HC_RUNTIME_ENV]);
    const root = runtime.kind === 'ok' ? runtime.value : join(HC_RUN_ROOT, String(process.getuid?.() ?? 0));
    const session = parseNonEmptyText(process.env[HC_SESSION_ENV]);
    const name = session.kind === 'ok' ? session.value : HC_DEFAULT_SESSION;
    return must(parseSocketPath(join(root, HC_SOCKET_FOLDER, `${name}${HC_SOCKET_SUFFIX}`)));
}

export function nextBackoff(failures: Count, base: Duration, cap: Duration): Duration {
    return duration(Math.min(cap, base * 2 ** Math.min(failures, 20)));
}

export function parseHcSnapshot(input: unknown): Result<HcSnapshot, ParseFailure> {
    if (!isFields(input)) {
        return err({ kind: 'not-a-row' });
    }
    const seq = parseCount(input['seq']);
    const rows = input['terminals'];
    if (seq.kind === 'err' || !Array.isArray(rows)) {
        return err({ kind: 'not-a-row' });
    }
    const terminals = rows.flatMap((row): HcPayload[] => {
        const payload = parseHcPayload(row);
        return payload.kind === 'ok' ? [payload.value] : [];
    });
    return ok({ seq: seq.value, terminals });
}

export function parseHcCoreHello(input: unknown): Result<HcCoreHello, ParseFailure> {
    if (!isFields(input)) {
        return err({ kind: 'not-a-row' });
    }
    const generation = parseCount(input['generation']);
    const version = parseText(input['version']);
    const names = input['methods'];
    if (generation.kind === 'err' || version.kind === 'err' || !Array.isArray(names)) {
        return err({ kind: 'not-a-row' });
    }
    const methods = names.flatMap((name): NonEmptyText[] => {
        const method = parseNonEmptyText(name);
        return method.kind === 'ok' ? [method.value] : [];
    });
    return ok({ version: version.value, methods, generation: generation.value });
}

export function parseHcFault(id: HcCallId, error: unknown): Result<HcFault, ParseFailure> {
    if (!isFields(error)) {
        return err({ kind: 'not-a-row' });
    }
    const code = parseRpcCode(error['code']);
    const message = parseText(error['message']);
    const data = error['data'];
    const reason = parseText(isFields(data) ? data['kind'] : '');
    if (code.kind === 'err' || message.kind === 'err' || reason.kind === 'err') {
        return err({ kind: 'not-a-row' });
    }
    return ok({ kind: 'fault', id, code: code.value, reason: reason.value, message: message.value });
}

export function parseHcReply(input: unknown): Result<HcReply | HcOdd | HcFault, ParseFailure> {
    if (!isFields(input)) {
        return err({ kind: 'not-a-row' });
    }
    const id = parseHcCallId(input['id']);
    if (id.kind === 'err') {
        return id;
    }
    if (Object.hasOwn(input, 'error')) {
        return parseHcFault(id.value, input['error']);
    }
    if (!Object.hasOwn(input, 'result')) {
        return err({ kind: 'not-a-row' });
    }
    const result = parseHcPayload(input['result']);
    return ok(result.kind === 'ok' ? { kind: 'reply', id: id.value, result: result.value } : { kind: 'odd', id: id.value });
}

export function parseHcEvent(input: unknown): Result<HcEvent, ParseFailure> {
    if (!isFields(input)) {
        return err({ kind: 'not-a-row' });
    }
    const seq = parseCount(input['seq']);
    const type = parseNonEmptyText(input['type']);
    const terminal = parseNonEmptyText(input['terminal']);
    const data = parseHcPayload(input['data']);
    if (seq.kind === 'err' || type.kind === 'err') {
        return err({ kind: 'not-a-row' });
    }
    return ok({ kind: 'event', seq: seq.value, terminal: terminal.kind === 'ok' ? terminal.value : null, type: type.value, data: data.kind === 'ok' ? data.value : NO_DATA });
}

export function parseHcNotification(method: unknown, params: unknown): Result<HcNotification, ParseFailure> {
    if (method === 'event') {
        return parseHcEvent(params);
    }
    if (method === 'heartbeat' && isFields(params)) {
        const seq = parseCount(params['seq']);
        return seq.kind === 'err' ? seq : ok({ kind: 'heartbeat', seq: seq.value });
    }
    const snapshot = method === 'missed' ? parseHcSnapshot(params) : err<ParseFailure>({ kind: 'not-a-row' });
    return snapshot.kind === 'err' ? snapshot : ok({ kind: 'missed', snapshot: snapshot.value });
}

export function parseHcCoreMessage(input: unknown): Result<HcCoreMessage, ParseFailure> {
    if (!isFields(input)) {
        return err({ kind: 'not-a-row' });
    }
    return Object.hasOwn(input, 'method') ? parseHcNotification(input['method'], input['params']) : parseHcReply(input);
}
