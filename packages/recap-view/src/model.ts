import type { ClosedWhy, ContextUse, Fact, RecapSections } from '@stateforge-labs/session-ledger';
import type { Brand } from './kernel.ts';
import type { Count, Percent, Wording } from './wording.ts';
import type {
    AgentLabel,
    AgentName,
    BranchName,
    Curating,
    Directory,
    Duration,
    FilePath,
    FromScreen,
    Instant,
    SessionKey,
    Prose,
    Queued,
    RepoName,
    Running,
    TaskName,
    Title,
    Tokens,
    WebBase,
} from './values.ts';

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
    readonly base: WebBase;
    readonly forge: Forge;
    readonly branch: BranchName | null;
}

export interface Note {
    readonly label: string;
    readonly at: number | null;
    readonly details: readonly string[];
    readonly mark?: string;
}

export interface Break {
    readonly kind: BoundaryKind;
    readonly at: Instant;
    readonly trigger: Trigger | null;
    readonly tokensBefore: Tokens | null;
    readonly tokensAfter: Tokens | null;
    readonly tookMs: Duration | null;
}

export interface Row {
    readonly id: SessionKey;
    readonly agent: AgentName;
    readonly state: RowState;
    readonly title: Title | null;
    readonly cwd: Directory | null;
    readonly lastPrompt?: Prose | null;
    readonly web?: Web | null;
    readonly context?: ContextUse | null;
    readonly since?: Instant | null;
    readonly fromScreen: FromScreen;
    readonly harnessRecap: Prose | null;
}

export interface ColumnTask {
    readonly name: TaskName;
    readonly members: readonly SessionKey[];
    readonly sections: RecapSections | null;
    readonly markdown: Prose;
}

export interface RecapColumn {
    readonly tasks: readonly ColumnTask[];
    readonly at: Instant | null;
    readonly running: Running;
    readonly backend: AgentName | null;
    readonly error: Prose | null;
}

export interface CompactionRow {
    readonly pane: SessionKey;
    readonly agent?: AgentName;
    readonly startedAt?: Instant;
    readonly stage: Stage;
    readonly brief: BriefOrigin | null;
    readonly writer: AgentName | null;
    readonly why: Prose | null;
    readonly stageAt: Instant;
    readonly queued: Queued;
    readonly tokensBefore: Tokens | null;
    readonly tokensAfter: Tokens | null;
    readonly tookMs: Duration | null;
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

export interface TextColumnView extends ColumnView<string> {}

export interface SessionStarted {
    readonly at: Instant;
    readonly forMs: Duration;
}

export interface SessionRun {
    readonly cause: RunCause;
    readonly count: Count;
}

export interface SessionRuns {
    readonly total: Count;
    readonly byCause: readonly SessionRun[];
}

export interface SessionTokenPair {
    readonly before: Tokens;
    readonly after: Tokens;
}

export interface SessionOrigins {
    readonly operator: Count;
    readonly auto: Count;
}

export interface SessionCompactions {
    readonly count: Count;
    readonly byOrigin: SessionOrigins;
    readonly measured: readonly SessionTokenPair[];
}

export interface SessionAgent {
    readonly label: AgentLabel;
    readonly share: Percent;
    readonly window: Tokens;
}

export interface SessionRepo {
    readonly name: RepoName;
    readonly branch: BranchName | null;
}

export interface SessionFile {
    readonly path: FilePath;
    readonly count: Count;
}

export interface SessionAutocompact {
    readonly decisions: Count;
    readonly compacted: Count;
    readonly waited: Count;
}

export interface SessionRecap {
    readonly started: SessionStarted | null;
    readonly runs: SessionRuns | null;
    readonly compactions: SessionCompactions | null;
    readonly agents: readonly SessionAgent[];
    readonly repo: SessionRepo | null;
    readonly files: readonly SessionFile[];
    readonly chapters: Count | null;
    readonly autocompact: SessionAutocompact | null;
}

export interface ExpandedStory {
    readonly text: Prose;
    readonly at: Instant;
}

export interface ExpandedTask {
    readonly name: TaskName;
    readonly facts: readonly Fact[];
    readonly story: ExpandedStory | null;
    readonly curating: Curating;
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
