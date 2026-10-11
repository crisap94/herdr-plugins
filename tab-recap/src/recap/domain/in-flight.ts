import type { Brand } from './brand.ts';

export type RunningCount = Brand<number, 'RunningCount'>;
export type FlightReason = Brand<string, 'FlightReason'>;
export type AwaitedNames = Brand<string, 'AwaitedNames'>;
export type BackgroundTool = Brand<string, 'BackgroundTool'>;
export type BackgroundLabel = Brand<string, 'BackgroundLabel'>;
export type FlightDetail = Brand<string, 'FlightDetail'>;

export const NO_RUNNING = 0 as RunningCount;

export const runningCount = (raw: number): RunningCount => Math.max(0, Math.trunc(raw)) as RunningCount;
export const flightReason = (raw: string): FlightReason => raw as FlightReason;
export const awaitedNames = (raw: string): AwaitedNames => raw as AwaitedNames;
export const backgroundTool = (raw: string): BackgroundTool => raw as BackgroundTool;
export const backgroundLabel = (raw: string): BackgroundLabel => raw as BackgroundLabel;

export interface BackgroundItem {
    readonly tool: BackgroundTool;
    readonly label: BackgroundLabel;
}

export function backgroundItem(tool: BackgroundTool, label: BackgroundLabel | null): BackgroundItem {
    return { tool, label: label ?? (String(tool) as BackgroundLabel) };
}

export type Foreground =
    | { readonly kind: 'none' }
    | { readonly kind: 'running'; readonly count: RunningCount; readonly why: FlightReason }
    | { readonly kind: 'unknown'; readonly why: FlightReason };

export type Awaiting = { readonly kind: 'none' } | { readonly kind: 'on'; readonly names: AwaitedNames };

export interface Observed {
    readonly foreground: Foreground;
    readonly background: readonly BackgroundItem[];
}

export interface Flight extends Observed {
    readonly awaiting: Awaiting;
}

export const NOT_AWAITING: Awaiting = { kind: 'none' };
export const NOTHING_IN_FLIGHT: Observed = { foreground: { kind: 'none' }, background: [] };

export function foregroundOf(count: RunningCount, why: FlightReason): Foreground {
    return count > 0 ? { kind: 'running', count, why } : { kind: 'none' };
}

export function observedFrom(count: RunningCount, background: readonly BackgroundItem[], why: FlightReason): Observed {
    return { foreground: foregroundOf(count, why), background };
}

export function unreadable(why: FlightReason): Observed {
    return { foreground: { kind: 'unknown', why }, background: [] };
}

export function flightOf(observed: Observed, awaiting: Awaiting): Flight {
    return { ...observed, awaiting };
}

export function holdsLane(flight: Flight, atCeiling: boolean): boolean {
    if (flight.foreground.kind !== 'none') return true;
    return flight.awaiting.kind === 'on' && !atCeiling;
}

function holdingDetail(flight: Flight): string | null {
    const { foreground, awaiting } = flight;
    if (foreground.kind === 'unknown') return foreground.why;
    if (foreground.kind === 'running') return `${foreground.count} running`;
    return awaiting.kind === 'on' ? `awaiting ${awaiting.names}` : null;
}

function overridingDetail(flight: Flight): string[] {
    return flight.awaiting.kind === 'on' ? [`ceiling-overrides-wait (awaiting ${flight.awaiting.names})`] : [];
}

function keptDetail(flight: Flight): string[] {
    return flight.background.length > 0 ? [`background: ${flight.background.length} kept running`] : [];
}

export function flightDetail(flight: Flight, atCeiling: boolean): FlightDetail | null {
    if (holdsLane(flight, atCeiling)) {
        const held = holdingDetail(flight);
        return held === null ? null : (held as FlightDetail);
    }
    const parts = [...(atCeiling ? overridingDetail(flight) : []), ...keptDetail(flight)];
    return parts.length === 0 ? null : (parts.join('; ') as FlightDetail);
}
