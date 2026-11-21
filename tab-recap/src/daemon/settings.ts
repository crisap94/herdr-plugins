import type { Locale } from '#src/i18n/index.ts';
import type { Policy } from '#src/recap/domain/policy.ts';
import type { DeciderJob, Job, JobAnswer } from '#src/recap/domain/job.ts';
import type { AutocompactPolicy, BriefRetention, CoverageBy, JevSettings } from '#src/recap/domain/autocompact.ts';
import type { AutocompactTuning } from '#src/recap/domain/autocompact-style.ts';
import type { CompactTarget } from '#src/recap/domain/compaction.ts';
import type { Sizing } from '#src/recap/domain/layout.ts';
import type { ClosedLaneDays } from '#src/recap/domain/retention.ts';
import type { HerdrEvents } from '#src/recap/domain/herdr-events.ts';
import type { HandoffRequests } from '#src/recap/domain/handoff-requests.ts';
import type { CompactNote } from '#src/recap/domain/compact-note.ts';
import type { TelemetryTags } from '#src/recap/domain/telemetry-tags.ts';
import type { ClaudePolicyAck } from '#src/recap/domain/claude-policy-ack.ts';
import type { RepairMode } from '#src/recap/application/job-kit/repair.ts';
import type { CloseEvidence, Pipeline } from '#src/recap/domain/pipeline.ts';
import type { Debounce } from '#src/recap/domain/debounce.ts';
import type { Pacing } from '#src/recap/domain/pacing.ts';
import type { Effort } from '#src/recap/domain/effort.ts';
import type { BackendChoice, BackendId, EnvironmentName } from '#src/recap/domain/backend.ts';
import type { PrunedWriterView, WriterView } from '#src/recap/domain/writer-view.ts';
import type { Count, PositiveCount } from '#src/recap/domain/count.ts';
import type { Duration } from '#src/recap/domain/time.ts';
import type { Text } from '#src/recap/domain/text.ts';
import type { AgentKind } from '#src/recap/domain/ids.ts';

export type SettingReader = (key: EnvironmentName) => Text | undefined;
export type Glow = 'auto' | 'on' | 'off';
export type Models = Readonly<Record<BackendId, Text>>;

export type SettingName =
    | 'LC_ALL'
    | 'LC_MESSAGES'
    | 'LANG'
    | 'HERDR_PLUGIN_CONFIG_DIR'
    | 'HERDR_PLUGIN_STATE_DIR'
    | 'TAB_RECAP_STATE'
    | 'TAB_RECAP_LOCALE'
    | 'TAB_RECAP_RECAP_LANG'
    | 'TAB_RECAP_MODEL'
    | 'TAB_RECAP_GLOW'
    | 'TAB_RECAP_WRITER_PRUNE'
    | 'TAB_RECAP_WRITER_KEEP_NEWEST'
    | 'TAB_RECAP_WRITER_NEXT_HOURS'
    | 'TAB_RECAP_AGENTS'
    | 'TAB_RECAP_SCREEN_AGENTS'
    | 'TAB_RECAP_TABS'
    | 'TAB_RECAP_BACKEND'
    | 'TAB_RECAP_HERDR_EVENTS'
    | 'TAB_RECAP_CUSTOM_CMD'
    | 'TAB_RECAP_EFFORT'
    | 'TAB_RECAP_PIPELINE'
    | 'TAB_RECAP_WRITER_CLOSE_EVIDENCE'
    | 'TAB_RECAP_WRITER_ANSWER'
    | 'TAB_RECAP_RUN_DEBOUNCE_MS'
    | 'TAB_RECAP_RUN_PACING'
    | 'TAB_RECAP_RUN_QUIET_MS'
    | 'TAB_RECAP_RUN_MAX_WAIT_MS'
    | 'TAB_RECAP_RECONCILE_EVERY'
    | 'TAB_RECAP_WIDTH'
    | 'TAB_RECAP_MIN_COLS'
    | 'TAB_RECAP_MAX_COLS'
    | 'TAB_RECAP_MIN_TAB_COLS'
    | 'TAB_RECAP_GIVE_UP_MS'
    | 'TAB_RECAP_CLOSE_GRACE_MS'
    | 'TAB_RECAP_COMPACT_TARGET'
    | 'TAB_RECAP_COMPACT_HINT'
    | 'TAB_RECAP_CONTEXT_WINDOW'
    | 'TAB_RECAP_KEEP_INPUT_DAYS'
    | 'TAB_RECAP_KEEP_BRIEF_DAYS'
    | 'TAB_RECAP_CURATOR_REPAIR'
    | 'TAB_RECAP_AUTOCOMPACT_COVERAGE_BY'
    | 'TAB_RECAP_AUTOCOMPACT_COVERAGE_MODEL'
    | 'TAB_RECAP_AUTOCOMPACT_COVERAGE_EFFORT'
    | 'TAB_RECAP_KEEP_DAYS'
    | 'TAB_RECAP_CLOSED_LANE_DAYS'
    | 'TAB_RECAP_TIMEOUT_MS'
    | 'TAB_RECAP_HANDOFF_REQUESTS'
    | 'TAB_RECAP_COMPACT_NOTE'
    | 'TAB_RECAP_TELEMETRY_TAGS'
    | 'TAB_RECAP_CLAUDE_POLICY_ACK';

export interface CompactionSettings {
    readonly target: CompactTarget;
    readonly hint: Count | null;
    readonly window: PositiveCount | null;
}

export interface Settings {
    readonly backend: BackendChoice;
    readonly models: Models;
    readonly customCommand: Text;
    readonly effort: Effort;
    readonly pipeline: Pipeline;
    readonly writerCloseEvidence: CloseEvidence;
    readonly writerAnswer?: JobAnswer;
    readonly recapDebounce: Debounce;
    readonly pacing: Pacing;
    readonly reconcileEvery: PositiveCount;
    readonly locale: Locale;
    readonly recapLanguage: Text;
    readonly sizing: Sizing;
    readonly policy: Policy;
    readonly screenAgents: readonly AgentKind[];
    readonly compaction: CompactionSettings;
    readonly brief: Job;
    readonly judge: Job;
    readonly keepInputDays: Count;
    readonly keepBrief: BriefRetention;
    readonly curator: Job;
    readonly curatorRepair: RepairMode;
    readonly autocompact: AutocompactPolicy;
    readonly tuning: AutocompactTuning;
    readonly decider: DeciderJob;
    readonly coverage: CoverageBy;
    readonly coverageJob: DeciderJob;
    readonly jev: JevSettings;
    readonly keepDays: Count;
    readonly closedLaneDays: ClosedLaneDays;
    readonly glow: Glow;
    readonly timeoutMs: Duration;
    readonly herdrEvents: HerdrEvents;
    readonly handoffRequests: HandoffRequests;
    readonly compactNote: CompactNote;
    readonly writerView: WriterView;
    readonly writerViewSettings: PrunedWriterView;
    readonly telemetryTags: TelemetryTags;
    readonly claudePolicyAck: ClaudePolicyAck;
}

export type SettingGet = (name: SettingName) => Text | undefined;
