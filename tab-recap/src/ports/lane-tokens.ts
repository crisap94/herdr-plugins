// The pane tokens tab-recap writes on herdr (`pane.report_metadata`). herdr keeps one flat map per pane, so a name is written only by its owner
// (the application decides which names); a value of null removes the name. A failure is an Unknown, never a throw.
import type { Done } from './columns.ts';

export interface LaneTokens {
    report(pane: string, tokens: Readonly<Record<string, string | null>>, ttlMs: number): Promise<Done>;
}
