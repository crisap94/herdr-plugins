import { opencodeModelsFile } from '@stateforge-labs/harness-adapters/opencode';
import { CatalogueWindows, candidatesOf } from './catalogue.ts';
import { handoffPlanner } from './handoff-plans.ts';
import { compactionPlanner } from './compaction-plans.ts';
import { claudeWindowFor, windowOfAgent } from './context-window.ts';
import type { CompactionPlanResult } from '#src/recap/domain/compaction-plan.ts';
import type { WindowOf } from '#src/recap/domain/compaction.ts';
import type { HandoffPlanResult } from '#src/recap/domain/handoff-plan.ts';
import { parseAgentKind } from '#src/recap/domain/ids.ts';
import { parseCount } from '#src/recap/domain/count.ts';
import type { Count } from '#src/recap/domain/count.ts';
import type { ModelCatalogue } from '#src/ports/model-catalogue.ts';
import type { ModelWindows } from '#src/ports/model-catalogue.ts';
import type { CompactionPlans } from '#src/ports/compaction-plans.ts';
import type { ContextWindows } from '#src/ports/context-windows.ts';
import type { HandoffPlans } from '#src/ports/handoff-plans.ts';
import { capabilityWording } from '#src/ports/capability-reasons.ts';
import { parseFsPath } from '#src/recap/domain/fs-path.ts';
import { parseText } from '#src/recap/domain/text.ts';
import { must } from '#src/protocol/result.ts';
import type { Result } from '#src/protocol/result.ts';
import { unsupported } from '#src/recap/domain/compaction-plan.ts';

const okOrNull = <T, E>(result: Result<T, E>): T | null => (result.kind === 'ok' ? result.value : null);

export const countFromLibrary = (window: number | null): Count | null => (window === null ? null : okOrNull(parseCount(window)));

export const countsFromLibrary = (values: readonly number[]): readonly Count[] => values.flatMap((value) => okOrNull(parseCount(value)) ?? []);

export class LocalCatalogue implements ModelCatalogue {
    private readonly windows: CatalogueWindows | null;

    constructor(file: string = opencodeModelsFile()) {
        const path = parseFsPath(file);
        this.windows = path.kind === 'ok' ? new CatalogueWindows(path.value) : null;
    }

    windowOf(model: string): number | null {
        const text = parseText(model);
        if (this.windows === null || text.kind === 'err') {
            return null;
        }
        const catalogue = this.windows.opened();
        if (catalogue === null) {
            return null;
        }
        return candidatesOf(catalogue, text.value).map((one) => catalogue.contextWindow(one.provider, one.model)).find((found) => found !== null) ?? null;
    }
}

const typedWindows = (catalogue: ModelCatalogue): ModelWindows => ({
    windowOf: (model) => {
        return countFromLibrary(catalogue.windowOf(model));
    },
});

const keepingRawWindows = (typed: WindowOf, catalogue: ModelCatalogue): WindowOf => (observed) => {
    const basis = typed(observed);
    if (observed.window !== null || observed.model === null || basis?.source === 'catalogue') {
        return basis;
    }
    const raw = catalogue.windowOf(observed.model);
    return raw === null ? basis : { window: raw, source: 'catalogue', sizes: basis?.sizes ?? [] };
};

export function windowOfKind(kind: string, catalogue: ModelCatalogue): WindowOf {
    return keepingRawWindows(windowOfAgent(okOrNull(parseAgentKind(kind)), typedWindows(catalogue)), catalogue);
}

export function contextWindows(catalogue: ModelCatalogue): ContextWindows {
    return { windowOf: (kind: string) => windowOfKind(kind, catalogue) };
}

export function claudeWindowOf(catalogue: ModelCatalogue): WindowOf {
    return keepingRawWindows(claudeWindowFor(typedWindows(catalogue)), catalogue);
}

export const compactionPlans: CompactionPlans = {
    forKind(rawKind: string, guidance: string): CompactionPlanResult {
        const kind = okOrNull(parseAgentKind(rawKind));
        return kind === null ? unsupported(capabilityWording('compaction-unavailable', must(parseText(rawKind)))) : compactionPlanner.forKind(kind, must(parseText(guidance)));
    },
};

export const handoffPlans: HandoffPlans = {
    forKind(rawKind: string): HandoffPlanResult {
        const kind = okOrNull(parseAgentKind(rawKind));
        return kind === null ? { kind: 'unsupported', reason: 'no-plan' } : handoffPlanner.forKind(kind);
    },
};
