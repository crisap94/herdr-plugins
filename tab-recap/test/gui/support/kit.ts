export type Handler = (...args: unknown[]) => unknown;
export type El = object;
export type Child = El | string | number;

export interface Call {
    readonly name: string;
    readonly args: readonly unknown[];
}

export interface Data {
    readonly kind: string;
    readonly calls: Call[];
    readonly children: Child[];
    readonly handlers: Map<string, Handler>;
    readonly extra: Map<string, unknown>;
    id: string | null;
}

const DATA = new WeakMap<object, Data>();
const THEN = 'then';
const EVENT_PREFIX = 'on_';
const EMPTY = new Set<unknown>([null, undefined, false, true]);

export function dataOf(node: El): Data {
    const found = DATA.get(node);
    if (!found) {
        throw new Error('not a fake element');
    }
    return found;
}

export const isEl = (value: unknown): value is El => typeof value === 'object' && value !== null && DATA.has(value);

function flatten(input: unknown): unknown[] {
    return Array.isArray(input) ? input.flatMap(flatten) : [input];
}

function adopt(data: Data, input: unknown): void {
    for (const one of flatten(input)) {
        if (EMPTY.has(one)) {
            continue;
        }
        if (typeof one === 'string' || typeof one === 'number' || isEl(one)) {
            data.children.push(one);
        }
    }
}

const isHandler = (value: unknown): value is Handler => typeof value === 'function';

const lastFunction = (args: readonly unknown[]): Handler | null => args.findLast(isHandler) ?? null;

function onHover(data: Data, name: string, body: unknown): void {
    const detached = el(name);
    if (isHandler(body)) {
        body(detached);
    }
    data.calls[data.calls.length - 1] = { name, args: [detached] };
}

type Step = (self: El, data: Data, args: unknown[]) => void;

const adoptStep: Step = (_self, data, args) => { adopt(data, args[0]); };
const whenStep: Step = (self, _data, args) => {
    const body = args[1];
    if (args[0] && isHandler(body)) {
        body(self);
    }
};
const idStep: Step = (_self, data, args) => { data.id = typeof args[0] === 'string' ? args[0] : null; };

const STEPS = new Map<string, Step>([
    ['child', adoptStep], ['children', adoptStep], ['when', whenStep], ['id', idStep],
    ['hover', (_self, data, args): void => { onHover(data, 'hover', args[0]); }],
    ['range_style', (_self, data, args): void => { onHover(data, 'range_style', args[0]); }],
]);

function record(self: El, data: Data, name: string, args: unknown[]): El {
    data.calls.push({ name, args });
    const handler = name.startsWith(EVENT_PREFIX) ? lastFunction(args) : null;
    if (handler) {
        data.handlers.set(name, handler);
    }
    STEPS.get(name)?.(self, data, args);
    return self;
}

export function el(kind: string, extra: Record<string, unknown> = {}): El {
    const data: Data = { kind, calls: [], children: [], handlers: new Map(), extra: new Map(Object.entries(extra)), id: null };
    const proxy: El = new Proxy({}, {
        get(_target, prop): unknown {
            if (typeof prop === 'symbol' || prop === THEN) {
                return undefined;
            }
            return (...args: unknown[]): El => record(proxy, data, prop, args);
        },
    });
    DATA.set(proxy, data);
    return proxy;
}

export class View {
    readonly fake = true;
}

export const div = (): El => el('div');
export const h_flex = (): El => el('h_flex');
export const v_flex = (): El => el('v_flex');
export const svg = (path: string): El => el('svg', { path });

export class FakeState {
    readonly handlers = new Map<string, Handler>();
    readonly options: unknown;
    text = '';
    focused = 0;

    constructor(options: unknown) {
        this.options = options;
    }

    static new(options: unknown): FakeState {
        return new FakeState(options);
    }

    on(name: string, handler: Handler): void {
        this.handlers.set(name, handler);
    }

    value(): string {
        return this.text;
    }

    set_value(value: string): void {
        this.text = value;
    }

    focus(): void {
        this.focused += 1;
    }

    fire(name: string, cx: unknown): void {
        this.handlers.get(name)?.({}, cx);
    }
}

export const InputState = FakeState;
export const TextareaState = FakeState;
export const Input = { new: (state: FakeState): El => el('Input', { state }) };
export const Textarea = { new: (state: FakeState): El => el('Textarea', { state }) };
export const TextView = { markdown: (id: string, text: string): El => el('TextView', { markdownId: id, markdown: text }) };
