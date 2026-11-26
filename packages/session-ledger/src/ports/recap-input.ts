import type { HarnessKind, SessionKey } from '#src/recap/domain/followed-session-shape.ts';
import type { ClosedWhy, Section } from '#src/recap/domain/fact.ts';
import type { Directory } from '#src/recap/domain/directory.ts';
import type { Text } from '#src/recap/domain/text.ts';
import type { Instant } from '#src/recap/domain/time.ts';
import type { HiddenCounts } from '#src/recap/domain/writer-view.ts';
import type { Brand } from '#src/recap/domain/brand.ts';
import type { AgentNote, Entry } from './transcripts.ts';

export type Flagged = Brand<boolean, 'Flagged'>;

export type Several = Brand<boolean, 'Several'>;

export interface InputAgent extends LaneHint { readonly id: Text; readonly kind: HarnessKind; readonly label: Text; readonly pane: SessionKey; readonly source: 'transcript' | 'screen'; }

export interface LaneHint { readonly cwd: Directory | null; readonly repo: Directory | null; readonly branch: Text | null; readonly files: readonly Text[]; }

export interface TaskGroup { readonly id: Text; readonly name: Text; readonly lanes: readonly SessionKey[]; }

export interface InputNote extends AgentNote { readonly agent: Text; }

export interface InputTranscript { readonly agent: Text; readonly entries: readonly Entry[]; }

export interface InputFact { readonly id: Text; readonly section: Section; readonly text: Text; readonly state: 'open' | 'closed'; readonly first: Instant; readonly last: Instant; readonly why: Text | null; readonly ref: Text | null; readonly anchor: Text | null; readonly agent: Text | null; readonly closed: ClosedWhy | null; }

export interface InputLedger { readonly task: Text | null; readonly facts: readonly InputFact[]; readonly hidden?: HiddenCounts; }

export interface InputCandidate { readonly section: Section; readonly text: Text; readonly why: Text | null; readonly ref: Text | null; readonly at: Instant | null; readonly anchor: Text; readonly agent: Text | null; readonly flagged: Flagged; }

export interface InputTab { readonly id: Text; readonly now: Instant; readonly zone: Text; }

export interface RecapInput { readonly tab: InputTab; readonly agents: readonly InputAgent[]; readonly tasks: readonly TaskGroup[]; readonly ledgers: readonly InputLedger[]; readonly notes: readonly InputNote[]; readonly transcripts: readonly InputTranscript[]; readonly candidates?: readonly InputCandidate[]; }
