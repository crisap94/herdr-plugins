import type { Agents } from './agents.ts';
import type { Columns } from './columns.ts';
import type { FleetSource } from './fleet-source.ts';
import type { Harnesses } from './harnesses.ts';
import type { LaneTokens } from './lane-tokens.ts';
import type { Notifier } from './notifier.ts';
import type { PaneTokens } from './pane-tokens.ts';
import type { Screens } from './screens.ts';
import type { WorkspaceTokens } from './workspace-tokens.ts';

export interface Fleet extends FleetSource, Columns, Harnesses, Notifier, Screens, LaneTokens, PaneTokens, WorkspaceTokens {
    agents(): Agents;
}
