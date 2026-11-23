import { agentKind as agentKindOf, paneId as paneIdOf, tabId as tabIdOf, workspaceId as workspaceIdOf } from '#src/recap/domain/ids.ts';
import type { AgentKind, PaneId, TabId, WorkspaceId } from '#src/recap/domain/ids.ts';
import { textOf } from '#src/recap/domain/text.ts';

export const paneId = (raw: string): PaneId => paneIdOf(textOf(raw));

export const tabId = (raw: string): TabId => tabIdOf(textOf(raw));

export const workspaceId = (raw: string): WorkspaceId => workspaceIdOf(textOf(raw));

export const agentKind = (raw: string): AgentKind => agentKindOf(textOf(raw));
