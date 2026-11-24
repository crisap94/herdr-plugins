import { claudeContextWindow, ClaudeWindow } from '@stateforge-labs/harness-adapters/claude';
import type { WindowBasis, WindowOf } from '@stateforge-labs/session-ledger';
import type { ContextObserved as Observed } from '@stateforge-labs/session-ledger';
import type { HarnessKind } from '#src/recap/domain/ids.ts';
import type { Count } from '@stateforge-labs/session-ledger';
import { parseText, textOf } from '@stateforge-labs/session-ledger';
import { registeredKindOf } from '@stateforge-labs/session-ledger';
import type { RegisteredKind } from '@stateforge-labs/session-ledger';
import type { ContextWindowLookup } from '#src/ports/context-windows.ts';
import type { ModelWindows } from '#src/ports/model-catalogue.ts';
import { supported } from '#src/ports/capability.ts';
import type { Support } from '#src/ports/capability.ts';
import type { ContextWindowWhy } from '@stateforge-labs/session-ledger';

import { countOf } from '@stateforge-labs/session-ledger';

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

export function windowOfAgent(kind: HarnessKind | null, catalogue: ModelWindows): WindowOf {
    const registered = kind === null ? null : registeredKindOf(textOf(kind));
    const capability = registered === null ? supported(exactWindow) : WINDOW_SOURCES[registered];
    const source = capability.kind === 'supported' ? capability.value : noWindow;
    return (observed) => source(observed, catalogue);
}

export function agentWindows(catalogue: ModelWindows): ContextWindowLookup {
    return { windowOf: (kind: HarnessKind) => windowOfAgent(kind, catalogue) };
}

export function claudeWindowFor(catalogue: ModelWindows): WindowOf {
    return (observed) => claudeWindow(observed, catalogue);
}
