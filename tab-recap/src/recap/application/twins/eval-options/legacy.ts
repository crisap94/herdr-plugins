import { must } from '#src/protocol/result.ts';
import type { Pipeline } from '#src/recap/domain/pipeline.ts';
import { parseText } from '#src/recap/domain/text.ts';
import { isEvalItemCheck, parseEvalRequest, type EvalRequest } from '../../eval-request.ts';

export interface EvalOptions {
    readonly mode: 'sample' | 'label' | 'agree' | 'gates' | 'replay';
    readonly count: number;
    readonly tab: string | null;
    readonly since: number | null;
    readonly json: boolean;
    readonly replay: string | null;
    readonly kind: string | null;
    readonly compareImported: string | null;
    readonly pipeline: Pipeline | null;
    readonly mergeTurns?: number;
    readonly check: string | null;
    readonly prune: boolean;
}

export type ParsedEval = { readonly kind: 'options'; readonly options: EvalOptions } | { readonly kind: 'usage'; readonly why: string };

export const isItemCheck = (check: string): boolean => isEvalItemCheck(must(parseText(check))) === 'present';

const legacyOf = (options: EvalRequest): EvalOptions => ({
    mode: options.mode, count: options.count, tab: options.tab, since: options.since, json: options.json === 'present',
    replay: options.replay, kind: options.kind, compareImported: options.compareImported, pipeline: options.pipeline,
    ...(options.mergeTurns === undefined ? {} : { mergeTurns: options.mergeTurns }), check: options.check, prune: options.prune === 'present',
});

export function parseEval(argv: readonly string[]): ParsedEval {
    const parsed = parseEvalRequest(argv.map((arg) => must(parseText(arg))));
    return parsed.kind === 'usage' ? { kind: 'usage', why: parsed.why } : { kind: 'options', options: legacyOf(parsed.options) };
}
