import type { Brand } from '#src/recap/domain/brand.ts';
import type { Lane, TabId } from '#src/recap/domain/lane-shape.ts';
import type { RecapCause } from '#src/recap/domain/recap-cause.ts';
import type { Text } from '#src/recap/domain/text.ts';
import type { Instant } from '#src/recap/domain/time.ts';
import type { LaneCursor } from '#src/ports/recap-records.ts';
import type { RecapRequest } from '#src/ports/summarizer.ts';
import type { Chunk, Grew, SourcePath, Transcripts } from '#src/ports/transcripts.ts';
import type { Clock } from '#src/ports/clock.ts';
import type { Ground, OpsExtracted } from './extract-job.ts';
import type { Pending } from './pending-plan.ts';
import type { Fresh } from './recap-input.ts';
import type { TaskShape } from '#src/recap/domain/grouping.ts';

export type KeepInput = Brand<boolean, 'KeepInput'>;


export type Switched = Brand<boolean, 'Switched'>;

export type Flight = 'idle' | 'flying';

export interface Located { readonly reader: Transcripts; readonly source: SourcePath }

export interface Reading { readonly lane: Pending['lanes'][number]; readonly cursor: LaneCursor; readonly chunk: Chunk | null; readonly grew: Grew; readonly fresh: Fresh; readonly error: Text | null }

export interface Plan { readonly want: Text; readonly was: Text; readonly switched: Switched; readonly cause: RecapCause; readonly keys: readonly Text[] }

export interface Prepared { readonly tasks: readonly TaskShape[]; readonly request: RecapRequest; readonly ground: Ground }

export interface WrittenRun { readonly tasks: readonly TaskShape[]; readonly request: RecapRequest; readonly asked: OpsExtracted; readonly readings: readonly Reading[]; readonly parts: readonly Reading[] }

export interface Run { started(at: ReturnType<Clock['now']>): void; advanced(readings: readonly Reading[]): void }

export interface Slot { readonly tab: TabId; timer: ReturnType<typeof setTimeout> | null; flight: Flight; pending: Pending | null; lastStart: Instant | null; lastLanes: ReadonlySet<Lane['pane']>; waiting: (() => void)[]; deferred: 'none' | 'deferred' }
