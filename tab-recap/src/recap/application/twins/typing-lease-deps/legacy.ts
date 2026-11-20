import type { PaneTokens } from '#src/ports/pane-tokens.ts';
import type { LaneTokens } from '#src/ports/lane-tokens.ts';
import type { Milliseconds } from '#src/recap/domain/time.ts';

export interface TypingLeaseDeps {
    readonly tokens: LaneTokens;
    readonly panes: PaneTokens;
    readonly now: () => number;
    readonly pause: (ms: Milliseconds) => Promise<void>;
    readonly log: (line: string) => void;
}
