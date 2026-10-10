import type { Observed, WindowBasis, WindowOf } from '#src/recap/domain/compaction.ts';
import { registeredKindOf } from '#src/recap/domain/registered-kinds.ts';
import type { RegisteredKind } from '#src/recap/domain/registered-kinds.ts';
import type { ContextWindows } from '#src/ports/context-windows.ts';
import type { ModelCatalogue } from '#src/ports/model-catalogue.ts';

export const WINDOW_SIZES: readonly number[] = [200_000, 1_000_000];

const familyWindow = (model: string): number => {
    const id = model.toLowerCase();
    if (id.includes('[1m]')) {
        return 1_000_000;
    }
    const version = /(?:opus|sonnet)-(\d+)(?:[-.](\d{1,2})(?!\d))?/.exec(id);
    if (version === null) {
        return 200_000;
    }
    const [major, minor] = [Number(version[1]), Number(version[2] ?? 0)];
    return major > 4 || (major === 4 && minor >= 6) ? 1_000_000 : 200_000;
};

const catalogued = (observed: Observed, catalogue: ModelCatalogue): WindowBasis | null => {
    if (observed.model === null) {
        return null;
    }
    const window = catalogue.windowOf(observed.model);
    return window === null ? null : { window, source: 'catalogue' };
};

const stated = (observed: Observed): WindowBasis | null => observed.window === null ? null : { window: observed.window, source: 'agent' };

const reportedWindow = (observed: Observed, catalogue: ModelCatalogue): WindowBasis | null =>
    stated(observed) ?? catalogued(observed, catalogue);

const claudeWindow = (observed: Observed, catalogue: ModelCatalogue): WindowBasis =>
    reportedWindow(observed, catalogue) ?? { window: familyWindow(observed.model ?? ''), source: 'table' };

const WINDOW_SOURCES = {
    claude: claudeWindow,
    codex: reportedWindow,
    opencode: reportedWindow,
} satisfies Readonly<Record<RegisteredKind, (observed: Observed, catalogue: ModelCatalogue) => WindowBasis | null>>;

export function windowOfKind(kind: string, catalogue: ModelCatalogue): WindowOf {
    const registered = registeredKindOf(kind);
    const source = registered === null ? reportedWindow : WINDOW_SOURCES[registered];
    return (observed) => source(observed, catalogue);
}

export function contextWindows(catalogue: ModelCatalogue): ContextWindows {
    return { sizes: WINDOW_SIZES, windowOf: (kind) => windowOfKind(kind, catalogue) };
}

export function claudeWindowOf(catalogue: ModelCatalogue): WindowOf {
    return (observed) => claudeWindow(observed, catalogue);
}
