import type { ClosedWhy, Fact, RecapSections } from '@stateforge-labs/session-ledger';
import type { Brand } from './kernel.ts';
import type { Wording } from './wording.ts';

export type StyleName = 'bold' | 'dim' | 'italic' | 'red' | 'green' | 'yellow' | 'blue' | 'magenta' | 'cyan' | 'gray';
export type Width = Brand<number, 'Width'>;
export type Style<Text> = Readonly<Record<StyleName, (text: Text) => Text>>;
export type Markdown<Text> = (markdown: Text, width: Width) => readonly Text[] | null;
export type ViewMode = 'column' | 'modal' | 'bar';

export type Forge = 'gitlab' | 'github';
export type BoundaryKind = 'compacted' | 'switched';
export type Trigger = 'auto' | 'manual' | 'plugin';
export type RowState = 'working' | 'blocked' | 'idle' | 'done' | 'unknown';
export type ActiveStage = 'briefing' | 'compacting' | 'restoring';
export type EndStage = 'compacted' | 'failed' | 'unconfirmed' | 'skipped';
export type Stage = ActiveStage | EndStage;
export type BriefOrigin = 'written' | 'template';
export type RunCause = 'turn-ended' | 'focused' | 'requested';

export interface Web {
    readonly base: string;
    readonly forge: Forge;
    readonly branch: string | null;
}

export interface Note {
    readonly label: string;
    readonly at: number | null;
    readonly details: readonly string[];
    readonly mark?: string;
}

export interface Break {
    readonly kind: BoundaryKind;
    readonly at: number;
    readonly trigger: Trigger | null;
    readonly tokensBefore: number | null;
    readonly tokensAfter: number | null;
    readonly tookMs: number | null;
}

export interface Row {
    readonly id: string;
    readonly agent: string;
    readonly state: RowState;
    readonly title: string | null;
    readonly cwd: string | null;
    readonly lastPrompt?: string | null;
    readonly web?: Web | null;
    readonly context?: { readonly tokens: number; readonly window: number } | null;
    readonly since?: number | null;
    readonly fromScreen: boolean;
    readonly harnessRecap: string | null;
}

export interface ColumnTask {
    readonly name: string;
    readonly members: readonly string[];
    readonly sections: RecapSections | null;
    readonly markdown: string;
}

export interface RecapColumn {
    readonly tasks: readonly ColumnTask[];
    readonly at: number | null;
    readonly running: boolean;
    readonly backend: string | null;
    readonly error: string | null;
}

export interface CompactionRow {
    readonly pane: string;
    readonly stage: Stage;
    readonly brief: BriefOrigin | null;
    readonly writer: string | null;
    readonly why: string | null;
    readonly stageAt: number;
    readonly queued: boolean;
    readonly tokensBefore: number | null;
    readonly tokensAfter: number | null;
    readonly tookMs: number | null;
}

export interface ColumnView<Text> {
    readonly rows: readonly Row[] | null;
    readonly daemonVersion: string | null;
    readonly recap: RecapColumn | null;
    readonly notes: ReadonlyMap<string, readonly Note[]>;
    readonly warnings: readonly string[];
    readonly now: number;
    readonly wording: Wording<Text>;
    readonly version?: string | null;
    readonly compactHint?: number | null;
    readonly compactions?: readonly CompactionRow[];
    readonly style?: Style<Text>;
}

export interface SessionStarted {
    readonly at: number;
    readonly forMs: number;
}

export interface SessionRun {
    readonly cause: RunCause;
    readonly count: number;
}

export interface SessionRuns {
    readonly total: number;
    readonly byCause: readonly SessionRun[];
}

export interface SessionTokenPair {
    readonly before: number;
    readonly after: number;
}

export interface SessionCompactions {
    readonly count: number;
    readonly byOrigin: { readonly operator: number; readonly auto: number };
    readonly measured: readonly SessionTokenPair[];
}

export interface SessionAgent {
    readonly label: string;
    readonly share: number;
    readonly window: number;
}

export interface SessionRepo {
    readonly name: string;
    readonly branch: string | null;
}

export interface SessionFile {
    readonly path: string;
    readonly count: number;
}

export interface SessionAutocompact {
    readonly decisions: number;
    readonly compacted: number;
    readonly waited: number;
}

export interface SessionRecap {
    readonly started: SessionStarted | null;
    readonly runs: SessionRuns | null;
    readonly compactions: SessionCompactions | null;
    readonly agents: readonly SessionAgent[];
    readonly repo: SessionRepo | null;
    readonly files: readonly SessionFile[];
    readonly chapters: number | null;
    readonly autocompact: SessionAutocompact | null;
}

export interface ExpandedStory {
    readonly text: string;
    readonly at: number;
}

export interface ExpandedTask {
    readonly name: string;
    readonly facts: readonly Fact[];
    readonly story: ExpandedStory | null;
    readonly curating: boolean;
}

export interface ExpandedView<Text> {
    readonly tasks: readonly ExpandedTask[];
    readonly session: SessionRecap;
    readonly width: number;
    readonly wording: Wording<Text>;
    readonly style?: Style<Text>;
    readonly now: number;
    readonly zone: string;
    readonly webs: readonly (Web | null | undefined)[];
    readonly breaks?: readonly Break[];
}

export interface TimelineEntry {
    readonly fact: Fact;
    readonly drawnAt: number;
    readonly closed: ClosedWhy | null;
}

export interface Segment {
    readonly text: string;
    readonly url?: string;
}
