import { catalogFor } from '#src/i18n/index.ts';
import type { Messages } from '#src/i18n/index.ts';
import { must } from '#src/protocol/result.ts';
import { parseCount } from '#src/recap/domain/count.ts';
import { parseText } from '#src/recap/domain/text.ts';
import type { NoteState } from '#src/recap/application/compact-keys.ts';
import type { EvalReport } from '#src/recap/application/eval-report.ts';
import type { Candidate } from '#src/recap/application/eval-label.ts';
import type { Comparison } from '#src/recap/application/compare-imported.ts';
import { coloured } from '@stateforge-labs/recap-view/unstable/wrap.ts';
import type { Style } from '@stateforge-labs/recap-view/unstable/wrap.ts';
import type { Setup } from '#src/recap/application/setup-keys.ts';
import { compactFooterText, compactViewText } from './compact.ts';
import { comparisonText } from './compare.ts';
import { candidateText, reportText } from './eval.ts';
import { setupFooterLine, setupLines } from './setup.ts';

export function setupView(state: Setup, m: Messages, width: number, style: Style = coloured): string[] {
    return setupLines(state, catalogFor(m.locale), must(parseCount(width)), style);
}

export function setupFooter(state: Setup, m: Messages, width: number, style: Style = coloured): string {
    return setupFooterLine(state, catalogFor(m.locale), must(parseCount(width)), style);
}

export function compactView(state: NoteState, m: Messages, agent: string, width: number, style: Style = coloured): string[] {
    return [...compactViewText(state, m, must(parseText(agent)), must(parseCount(width)), style)];
}

export function compactFooter(m: Messages, width: number, style: Style = coloured): string {
    return compactFooterText(m, must(parseCount(width)), style);
}

export function comparisonLines(comparison: Comparison, beside: string, style: Style): string[] {
    return [...comparisonText(comparison, must(parseText(beside)), style)];
}

export function reportLines(report: EvalReport, style: Style, missing: number): string[] {
    return [...reportText(report, style, must(parseCount(missing)))];
}

export function candidateLines(candidate: Candidate, position: string, style: Style): string[] {
    return [...candidateText(candidate, must(parseText(position)), style)];
}
