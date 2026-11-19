import type { ClosedWhy, ContextUse, Fact, RecapSections } from '@stateforge-labs/session-ledger';
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

export interface BreakOf<Figure> {
    readonly kind: BoundaryKind;
    readonly at: Figure;
    readonly trigger: Trigger | null;
    readonly tokensBefore: Figure | null;
    readonly tokensAfter: Figure | null;
    readonly tookMs: Figure | null;
}

export interface Break extends BreakOf<number> {}

export interface RowOf<Text, Figure, Flag> {
    readonly id: Text;
    readonly agent: Text;
    readonly state: RowState;
    readonly title: Text | null;
    readonly cwd: Text | null;
    readonly lastPrompt?: Text | null;
    readonly web?: Web | null;
    readonly context?: ContextUse | null;
    readonly since?: Figure | null;
    readonly fromScreen: Flag;
    readonly harnessRecap: Text | null;
}

export interface Row extends RowOf<string, number, boolean> {}

export interface ColumnTaskOf<Text> {
    readonly name: Text;
    readonly members: readonly Text[];
    readonly sections: RecapSections | null;
    readonly markdown: Text;
}

export interface ColumnTask extends ColumnTaskOf<string> {}

export interface RecapColumnOf<Text, Figure, Flag> {
    readonly tasks: readonly ColumnTask[];
    readonly at: Figure | null;
    readonly running: Flag;
    readonly backend: Text | null;
    readonly error: Text | null;
}

export interface RecapColumn extends RecapColumnOf<string, number, boolean> {}

export interface CompactionRowOf<Text, Figure, Flag> {
    readonly pane: Text;
    readonly agent?: Text;
    readonly startedAt?: Figure;
    readonly stage: Stage;
    readonly brief: BriefOrigin | null;
    readonly writer: Text | null;
    readonly why: Text | null;
    readonly stageAt: Figure;
    readonly queued: Flag;
    readonly tokensBefore: Figure | null;
    readonly tokensAfter: Figure | null;
    readonly tookMs: Figure | null;
}

export interface CompactionRow extends CompactionRowOf<string, number, boolean> {}

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

export interface TextColumnView extends ColumnView<string> {}

export interface SessionStartedOf<Figure> {
    readonly at: Figure;
    readonly forMs: Figure;
}

export interface SessionStarted extends SessionStartedOf<number> {}

export interface SessionRunOf<Figure> {
    readonly cause: RunCause;
    readonly count: Figure;
}

export interface SessionRun extends SessionRunOf<number> {}

export interface SessionRunsOf<Figure> {
    readonly total: Figure;
    readonly byCause: readonly SessionRun[];
}

export interface SessionRuns extends SessionRunsOf<number> {}

export interface SessionTokenPairOf<Figure> {
    readonly before: Figure;
    readonly after: Figure;
}

export interface SessionTokenPair extends SessionTokenPairOf<number> {}

export interface SessionCompactionsOf<Figure> {
    readonly count: Figure;
    readonly byOrigin: { readonly operator: Figure; readonly auto: Figure };
    readonly measured: readonly SessionTokenPair[];
}

export interface SessionCompactions extends SessionCompactionsOf<number> {}

export interface SessionAgentOf<Text, Figure> {
    readonly label: Text;
    readonly share: Figure;
    readonly window: Figure;
}

export interface SessionAgent extends SessionAgentOf<string, number> {}

export interface SessionRepoOf<Text> {
    readonly name: Text;
    readonly branch: Text | null;
}

export interface SessionRepo extends SessionRepoOf<string> {}

export interface SessionFileOf<Text, Figure> {
    readonly path: Text;
    readonly count: Figure;
}

export interface SessionFile extends SessionFileOf<string, number> {}

export interface SessionAutocompactOf<Figure> {
    readonly decisions: Figure;
    readonly compacted: Figure;
    readonly waited: Figure;
}

export interface SessionAutocompact extends SessionAutocompactOf<number> {}

export interface SessionRecapOf<Figure> {
    readonly started: SessionStarted | null;
    readonly runs: SessionRuns | null;
    readonly compactions: SessionCompactions | null;
    readonly agents: readonly SessionAgent[];
    readonly repo: SessionRepo | null;
    readonly files: readonly SessionFile[];
    readonly chapters: Figure | null;
    readonly autocompact: SessionAutocompact | null;
}

export interface SessionRecap extends SessionRecapOf<number> {}

export interface ExpandedStoryOf<Text, Figure> {
    readonly text: Text;
    readonly at: Figure;
}

export interface ExpandedStory extends ExpandedStoryOf<string, number> {}

export interface ExpandedTaskOf<Text, Flag> {
    readonly name: Text;
    readonly facts: readonly Fact[];
    readonly story: ExpandedStory | null;
    readonly curating: Flag;
}

export interface ExpandedTask extends ExpandedTaskOf<string, boolean> {}

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

export interface TextExpandedView extends ExpandedView<string> {}

export interface TimelineEntry {
    readonly fact: Fact;
    readonly drawnAt: number;
    readonly closed: ClosedWhy | null;
}

export interface Segment {
    readonly text: string;
    readonly url?: string;
}
