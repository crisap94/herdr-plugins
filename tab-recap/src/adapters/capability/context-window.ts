import { claudeContextWindow, ClaudeWindow } from '@stateforge-labs/harness-adapters/claude';
import type { Observed, WindowBasis, WindowOf } from '#src/recap/domain/compaction.ts';
import type { AgentKind } from '#src/recap/domain/ids.ts';
import type { Count } from '#src/recap/domain/count.ts';
import { parseText, textOf } from '#src/recap/domain/text.ts';
import { registeredKindOf } from '#src/recap/domain/registered-kinds.ts';
import type { RegisteredKind } from '#src/recap/domain/registered-kinds.ts';
import type { ContextWindowLookup } from '#src/ports/context-windows.ts';
import type { ModelWindows } from '#src/ports/model-catalogue.ts';
import { supported } from '#src/ports/capability.ts';
import type { Support } from '#src/ports/capability.ts';
import type { ContextWindowWhy } from '#src/ports/capability-reasons.ts';

import { countOf } from '#src/recap/domain/count.ts';

type Source = (observed: Observed, catalogue: ModelWindows) => WindowBasis | null;

const catalogued = (observed: Observed, catalogue: ModelWindows, sizes: readonly Count[]): WindowBasis | null => {
    if (observed.model === null) {
        return null;
    }
    const model = parseText(observed.model);
    if (model.kind === 'err') {
        return null;
    }
    const window = catalogue.windowOf(model.value);
    return window === null ? null : { window, source: 'catalogue', sizes };
};

const stated = (observed: Observed, sizes: readonly Count[]): WindowBasis | null => observed.window === null ? null : { window: observed.window, source: 'agent', sizes };

const reportedWindow = (observed: Observed, catalogue: ModelWindows, sizes: readonly Count[]): WindowBasis | null =>
    stated(observed, sizes) ?? catalogued(observed, catalogue, sizes);

const claudeWindow = (observed: Observed, catalogue: ModelWindows): WindowBasis => {
    const sizes = ClaudeWindow.Sizes.map((size) => countOf(size));
    return reportedWindow(observed, catalogue, sizes) ?? { window: countOf(claudeContextWindow(observed.model ?? '').window), source: 'table', sizes };
};

const exactWindow = (observed: Observed, catalogue: ModelWindows): WindowBasis | null => reportedWindow(observed, catalogue, []);
const noWindow = (_observed: Observed, _catalogue: ModelWindows): WindowBasis | null => null;

const WINDOW_SOURCES = {
    claude: supported(claudeWindow),
    codex: supported(exactWindow),
    opencode: supported(exactWindow),
} satisfies Readonly<Record<RegisteredKind, Support<Source, ContextWindowWhy>>>;

export function windowOfAgent(kind: AgentKind | null, catalogue: ModelWindows): WindowOf {
    const registered = kind === null ? null : registeredKindOf(textOf(kind));
    const capability = registered === null ? supported(exactWindow) : WINDOW_SOURCES[registered];
    const source = capability.kind === 'supported' ? capability.value : noWindow;
    return (observed) => source(observed, catalogue);
}

export function agentWindows(catalogue: ModelWindows): ContextWindowLookup {
    return { windowOf: (kind: AgentKind) => windowOfAgent(kind, catalogue) };
}

export function claudeWindowFor(catalogue: ModelWindows): WindowOf {
    return (observed) => claudeWindow(observed, catalogue);
}
