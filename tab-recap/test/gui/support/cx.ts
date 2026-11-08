import { FakeState, type Handler } from './kit.ts';

interface Timer {
    readonly every: boolean;
    readonly ms: number;
    due: number;
    readonly body: Handler;
    live: boolean;
}

export interface FakeCx {
    notifies: number;
    stops: number;
    focuses: number;
    readonly timers: Timer[];
    notify(): void;
    stop_propagation(): void;
    spawn(body: (cx: FakeCx) => unknown): Promise<unknown>;
    focus_handle(): { focus(): void; is_focused(): boolean };
    readonly timer: { every(ms: number, body: Handler): void; after(ms: number, body: Handler): void };
    advance(ms: number): void;
    intervals(): number[];
}

export function makeCx(): FakeCx {
    let clock = 0;
    const cx: FakeCx = {
        notifies: 0,
        stops: 0,
        focuses: 0,
        timers: [],
        notify(): void {
            cx.notifies += 1;
        },
        stop_propagation(): void {
            cx.stops += 1;
        },
        spawn: (body) => Promise.resolve().then(() => body(cx)),
        focus_handle: () => ({ focus: (): void => { cx.focuses += 1; }, is_focused: (): boolean => cx.focuses > 0 }),
        timer: {
            every: (ms, body): void => { cx.timers.push({ every: true, ms, due: clock + ms, body, live: true }); },
            after: (ms, body): void => { cx.timers.push({ every: false, ms, due: clock + ms, body, live: true }); },
        },
        advance(ms: number): void {
            clock += ms;
            for (const one of cx.timers) {
                while (one.live && one.due <= clock) {
                    one.due += one.ms;
                    one.live = one.every;
                    one.body(cx);
                }
            }
        },
        intervals: () => cx.timers.filter((one) => one.every).map((one) => one.ms),
    };
    return cx;
}

export const stateOf = (value: unknown): FakeState => {
    if (!(value instanceof FakeState)) {
        throw new Error('not a fake input state');
    }
    return value;
};
