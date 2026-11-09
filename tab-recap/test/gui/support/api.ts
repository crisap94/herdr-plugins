import type { FakeCx } from './cx.ts';
import type { El } from './kit.ts';

export interface RowLane {
    terminal: string;
    agent: string;
    status: string;
    name: string;
    contextPercent: number | null;
    hint: boolean;
    stage: string | null;
}

export interface TabRow {
    id: string;
    name: string;
    space: string;
    status: string;
    headline: string;
    soft: boolean;
    needs: number;
    waitingSince: number | null;
    recapAt: number | null;
    contextPercent: number | null;
    hintPercent: number | null;
    laneCount: number;
    lanes: RowLane[];
    writing: string;
}

export interface Stage {
    stage: string;
    stageAt: number;
    tookMs?: number | null;
}

export interface Step {
    name: string;
    state: string;
    secs: number | null;
}

export interface Event {
    t: number;
    sec: string;
    text: string;
}

export interface Bin {
    i: number;
    t0: number;
    t1: number;
    events: Event[];
    counts: Record<string, number>;
    n: number;
    dominant: string;
}

export interface Derive {
    byUrgency(rows: Partial<TabRow>[]): Partial<TabRow>[];
    visible(rows: Partial<TabRow>[], filter: Set<string>, q: string): Partial<TabRow>[];
    maxCtx(row: { contextPercent: number | null; lanes: { contextPercent: number | null }[] }): number | null;
    hintOf(row: Partial<TabRow>): number;
    needsYou(row: Partial<TabRow>): boolean;
    worstOf(rows: Partial<TabRow>[]): string;
    waitMinutes(row: Partial<TabRow>, now: number): number;
    stepsOf(stage: Stage, now: number): Step[];
}

export interface Timeline {
    bins(events: Event[], now: number): { bins: Bin[]; older: number; from: number };
    feed(events: Event[], breaks: { t: number; kind: string; text: string }[], filter: { sections: Set<string>; q: string; bin: Bin | null }, zone: string): { rows: { type: string; label?: string; t?: number }[]; count: number };
    matches(event: Event, filter: { sections: Set<string>; q: string }): boolean;
}

export interface Banner {
    seen: number;
    need: number;
    dec: number;
    fact: number;
    comp: number;
}

export interface Seen {
    lastSeen(tab: string, now: number): number;
    markSeen(tab: string, now: number): void;
    since(doc: unknown, seen: number): Banner;
}

export interface Keys {
    keyAction(event: { key: string; modifiers?: Record<string, boolean> }, typing: boolean): { action: string; arg: number | null } | null;
}

export interface Model {
    tabRows(index: unknown[]): TabRow[];
}

export interface Commands {
    safe(tab: unknown): boolean;
    refreshTab(tab: string): Promise<unknown>;
    touchMarker(tab: string): Promise<void>;
    clearMarker(tab: string): Promise<void>;
    openLink(url: unknown): void;
    jumpToLane(tab: string, terminal: string | null): void;
    restartDaemon(): Promise<boolean>;
}

export interface Role {
    init(props: unknown, cx: FakeCx): void;
    render(cx: FakeCx): El;
    close(cx: FakeCx): Promise<void>;
}

export interface ModuleOf<T> {
    default: new () => T;
}
