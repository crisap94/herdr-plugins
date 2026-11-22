import { brand } from './brand.ts';
import type { Brand } from './brand.ts';
import type { Count } from './count.ts';
import type { Text } from './text.ts';

export type RunningCount = Brand<number, 'RunningCount'>;
export type FlightReason = Brand<string, 'FlightReason'>;
export type AwaitedNames = Brand<string, 'AwaitedNames'>;
export type BackgroundTool = Brand<string, 'BackgroundTool'>;
export type BackgroundLabel = Brand<string, 'BackgroundLabel'>;
export type FlightDetail = Brand<string, 'FlightDetail'>;

export const runningOf = brand<number, 'RunningCount'>;

export const NO_RUNNING = runningOf(0);

export interface BackgroundItem {
    readonly tool: BackgroundTool;
    readonly label: BackgroundLabel;
}

export function backgroundItem(tool: BackgroundTool, label: BackgroundLabel | null): BackgroundItem {
    return { tool, label: label ?? brand<string, 'BackgroundLabel'>(tool) };
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

export function holdingDetail(flight: Flight): FlightDetail | null {
    const { foreground, awaiting } = flight;
    if (foreground.kind === 'unknown') return brand<string, 'FlightDetail'>(foreground.why);
    if (foreground.kind === 'running') return brand<string, 'FlightDetail'>(`${foreground.count} running`);
    return awaiting.kind === 'on' ? brand<string, 'FlightDetail'>(`awaiting ${awaiting.names}`) : null;
}

export function overridingDetail(flight: Flight): readonly FlightDetail[] {
    return flight.awaiting.kind === 'on' ? [brand<string, 'FlightDetail'>(`ceiling-overrides-wait (awaiting ${flight.awaiting.names})`)] : [];
}

export function keptDetail(flight: Flight): readonly FlightDetail[] {
    return flight.background.length > 0 ? [brand<string, 'FlightDetail'>(`background: ${flight.background.length} kept running`)] : [];
}

export function joinedDetail(parts: readonly FlightDetail[]): FlightDetail | null {
    return parts.length === 0 ? null : brand<string, 'FlightDetail'>(parts.join('; '));
}

export type AtCeiling = Brand<boolean, 'AtCeiling'>;
export const ceilingOf = brand<boolean, 'AtCeiling'>;
export type HoldsLane = Brand<boolean, 'HoldsLane'>;

export const runningCount = (raw: Count): RunningCount => runningOf(Math.max(0, Math.trunc(raw)));
export const flightReason = (raw: Text): FlightReason => brand<string, 'FlightReason'>(raw);
export const awaitedNames = (raw: Text): AwaitedNames => brand<string, 'AwaitedNames'>(raw);
export const backgroundTool = (raw: Text): BackgroundTool => brand<string, 'BackgroundTool'>(raw);
export const backgroundLabel = (raw: Text): BackgroundLabel => brand<string, 'BackgroundLabel'>(raw);

export function holdsLane(flight: Flight, atCeiling: AtCeiling): HoldsLane {
    return brand<boolean, 'HoldsLane'>(flight.foreground.kind !== 'none' || (flight.awaiting.kind === 'on' && !atCeiling));
}

export function flightDetail(flight: Flight, atCeiling: AtCeiling): FlightDetail | null {
    return holdsLane(flight, atCeiling) ? holdingDetail(flight) : joinedDetail([...(atCeiling ? overridingDetail(flight) : []), ...keptDetail(flight)]);
}
