import type { Engine, LedgerEvent } from '@stateforge-labs/session-ledger';
import type { TabRecaps } from '#src/engine/tab-recaps.ts';
import type { Store } from '#src/adapters/db/database.ts';
import type { Fleet } from '#src/ports/fleet.ts';
import type { TranscriptRegistry } from '#src/ports/transcript-registry.ts';
import type { EventStream } from '#src/recap/application/lane-events.ts';
import type { Board } from '#src/recap/domain/board.ts';
import type { Observation } from '#src/recap/domain/fold.ts';
import type { SessionKey } from '#src/recap/domain/ids.ts';
import type { LaneStatus } from '#src/recap/domain/status.ts';
import type { Clock } from '#src/ports/clock.ts';
import type { PreCompacts } from '#src/adapters/hooks/pre-compacts.ts';
import type { IdleClaim } from '#src/recap/application/autocompact.ts';
import type { Lane } from '#src/recap/domain/lane.ts';
import type { Candidate } from '@stateforge-labs/session-ledger/compaction-timing';
import type { Viewers } from './view/viewers.ts';
import { brand, type Brand } from '#src/recap/domain/brand.ts';

export type SlotName = 'hooks' | 'view' | 'roll' | 'timing';
export type SlotKey = 'TAB_RECAP_HOOKS' | 'TAB_RECAP_HOOKS_RESTORE' | 'TAB_RECAP_HOOKS_REBIND' | 'TAB_RECAP_VIEW_SERVER' | 'TAB_RECAP_SELF_ROLL' | 'TAB_RECAP_TIMING_EVENTS';
export type Switch = 'on' | 'off' | 'unset';
export type Mode = 'on' | 'off';
export type Root = Brand<string, 'Root'>;
export type Version = Brand<string, 'Version'>;
export type Line = Brand<string, 'LogLine'>;
export type Message = Brand<string, 'ErrorMessage'>;

export interface StatusEvent {
    readonly pane: SessionKey;
    readonly status: LaneStatus;
}

export interface SlotContext {
    readonly root: Root;
    readonly version: Version | null;
    readonly store: Store;
    readonly fleet: Fleet;
    readonly engine: Engine;
    readonly recaps: TabRecaps;
    readonly transcripts: TranscriptRegistry;
    readonly events: EventStream;
    readonly board: () => Board;
    readonly observe: (observation: Observation) => void;
    readonly statuses: (listener: (event: StatusEvent) => void) => () => void;
    readonly ledger: (listener: (event: LedgerEvent) => void) => () => void;
    readonly candidates: () => readonly Candidate[];
    readonly consider: (candidate: Candidate) => Promise<void>;
    readonly clock: Clock;
    readonly viewers: Viewers;
    readonly preCompacts: PreCompacts;
    readonly claimIdle: (lane: Lane) => IdleClaim;
    readonly setting: (key: SlotKey) => Switch;
    readonly log: (line: Line) => void;
}

export interface Running {
    readonly poll?: () => void;
    readonly tick?: () => void;
    readonly stop: () => void | Promise<void>;
}

export interface SlotModule {
    readonly start: (context: SlotContext) => Running | Promise<Running>;
}

export interface SlotEntry {
    readonly name: SlotName;
    readonly key: SlotKey;
    readonly defaultOn: Mode;
    readonly slot: SlotModule;
}

export interface Taps<E> {
    readonly tap: (listener: (event: E) => void) => () => void;
    readonly emit: (event: E) => void;
}

export interface Slots {
    readonly poll: () => void;
    readonly tick: () => void;
    readonly stop: () => Promise<void>;
}

export function parseSwitch(input: unknown): Switch {
    return input === 'on' || input === 'off' ? input : 'unset';
}

export function parseMessage(error: unknown): Message {
    return brand<string, 'ErrorMessage'>(error instanceof Error ? error.message : String(error));
}

export function parseLine(input: unknown): Line {
    return brand<string, 'LogLine'>(String(input));
}

export function parseRoot(input: unknown): Root {
    return brand<string, 'Root'>(String(input));
}

export function parseVersion(input: unknown): Version {
    return brand<string, 'Version'>(String(input));
}

export function taps<E>(log: (line: Line) => void): Taps<E> {
    const listeners: ((event: E) => void)[] = [];
    return {
        tap: (listener: (event: E) => void): () => void => {
            listeners.push(listener);
            return (): void => {
                const at = listeners.indexOf(listener);
                if (at >= 0) {
                    listeners.splice(at, 1);
                }
            };
        },
        emit: (event: E): void => {
            for (const listener of listeners.slice()) {
                try {
                    listener(event);
                } catch (error) {
                    log(parseLine(`tap: ${parseMessage(error)}`));
                }
            }
        },
    };
}

const decide = (entry: SlotEntry, value: Switch): Mode => (value === 'unset' ? entry.defaultOn : value);

const guarded = (log: (line: Line) => void, action: () => void): void => {
    try {
        action();
    } catch (error) {
        log(parseLine(`slot: ${parseMessage(error)}`));
    }
};

export function contextOf(parts: Omit<SlotContext, 'version' | 'setting'>, version: Version | null, setting: (key: SlotKey) => Switch): SlotContext {
    return { ...parts, version, setting };
}

export async function startSlots(table: readonly SlotEntry[], context: SlotContext): Promise<Slots> {
    const started: Running[] = [];
    for (const entry of table) {
        if (decide(entry, context.setting(entry.key)) !== 'on') {
            continue;
        }
        try {
            started.push(await entry.slot.start(context));
            context.log(parseLine(`slot ${entry.name} on`));
        } catch (error) {
            context.log(parseLine(`slot ${entry.name} did not start: ${parseMessage(error)}`));
        }
    }
    return {
        poll: (): void => {
            for (const running of started) {
                guarded(context.log, () => { running.poll?.(); });
            }
        },
        tick: (): void => {
            for (const running of started) {
                guarded(context.log, () => { running.tick?.(); });
            }
        },
        stop: async (): Promise<void> => {
            await Promise.all(started.map(async (running): Promise<void> => {
                try {
                    await running.stop();
                } catch (error) {
                    context.log(parseLine(`slot stop: ${parseMessage(error)}`));
                }
            }));
        },
    };
}
