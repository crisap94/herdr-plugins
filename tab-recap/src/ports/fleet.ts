import type { AgentPanes } from './agents.ts';
import type { ColumnPanes } from './columns.ts';
import type { FleetSource } from './fleet-source.ts';
import type { HarnessDirectory } from './harnesses.ts';
import type { LaneTokenReporter } from './lane-tokens.ts';
import type { NotifierPort } from './notifier.ts';
import type { PaneTokens } from './pane-tokens.ts';
import type { ScreenReader } from './screens.ts';
import type { WorkspaceTokenReporter } from './workspace-tokens.ts';

export interface Fleet extends FleetSource, ColumnPanes, HarnessDirectory, NotifierPort, ScreenReader, LaneTokenReporter, PaneTokens, WorkspaceTokenReporter {
    agents(): AgentPanes;
}
