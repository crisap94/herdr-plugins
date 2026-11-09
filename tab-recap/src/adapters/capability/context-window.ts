import { claudeContextWindow, ClaudeWindow } from '@stateforge-labs/harness-adapters/claude';
import type { Observed, WindowBasis, WindowOf } from '#src/recap/domain/compaction.ts';
import { registeredKindOf } from '#src/recap/domain/registered-kinds.ts';
import type { RegisteredKind } from '#src/recap/domain/registered-kinds.ts';
import type { ContextWindows } from '#src/ports/context-windows.ts';
import type { ModelCatalogue } from '#src/ports/model-catalogue.ts';
import { supported } from '#src/ports/capability.ts';
import type { Capability } from '#src/ports/capability.ts';
import type { ContextWindowWhy } from '#src/ports/capability-reasons.ts';

const catalogued = (observed: Observed, catalogue: ModelCatalogue, sizes: readonly number[]): WindowBasis | null => {
    if (observed.model === null) {
        return null;
    }
    const window = catalogue.windowOf(observed.model);
    return window === null ? null : { window, source: 'catalogue', sizes };
};

const stated = (observed: Observed, sizes: readonly number[]): WindowBasis | null => observed.window === null ? null : { window: observed.window, source: 'agent', sizes };

const reportedWindow = (observed: Observed, catalogue: ModelCatalogue, sizes: readonly number[]): WindowBasis | null =>
    stated(observed, sizes) ?? catalogued(observed, catalogue, sizes);

const claudeWindow = (observed: Observed, catalogue: ModelCatalogue): WindowBasis =>
    reportedWindow(observed, catalogue, ClaudeWindow.Sizes) ?? { window: claudeContextWindow(observed.model ?? '').window, source: 'table', sizes: ClaudeWindow.Sizes };

const exactWindow = (observed: Observed, catalogue: ModelCatalogue): WindowBasis | null => reportedWindow(observed, catalogue, []);
const noWindow = (_observed: Observed, _catalogue: ModelCatalogue): WindowBasis | null => null;

const WINDOW_SOURCES = {
    claude: supported(claudeWindow),
    codex: supported(exactWindow),
    opencode: supported(exactWindow),
} satisfies Readonly<Record<RegisteredKind, Capability<(observed: Observed, catalogue: ModelCatalogue) => WindowBasis | null, ContextWindowWhy>>>;

export function windowOfKind(kind: string, catalogue: ModelCatalogue): WindowOf {
    const registered = registeredKindOf(kind);
    const capability = registered === null ? supported(exactWindow) : WINDOW_SOURCES[registered];
    const source = capability.kind === 'supported' ? capability.value : noWindow;
    return (observed) => source(observed, catalogue);
}

export function contextWindows(catalogue: ModelCatalogue): ContextWindows {
    return { windowOf: (kind) => windowOfKind(kind, catalogue) };
}

export function claudeWindowOf(catalogue: ModelCatalogue): WindowOf {
    return (observed) => claudeWindow(observed, catalogue);
}
