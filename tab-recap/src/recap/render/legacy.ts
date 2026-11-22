import { must } from '#src/protocol/result.ts';
import { parseCount } from '#src/recap/domain/count.ts';
import { parseText } from '#src/recap/domain/text.ts';
import type { EvalReport } from '#src/recap/application/eval-report.ts';
import type { Candidate } from '#src/recap/application/eval-label.ts';
import type { Style } from '@stateforge-labs/recap-view/unstable/wrap.ts';
import { candidateText, reportText } from './eval.ts';

export function reportLines(report: EvalReport, style: Style, missing: number): string[] {
    return [...reportText(report, style, must(parseCount(missing)))];
}

export function candidateLines(candidate: Candidate, position: string, style: Style): string[] {
    return [...candidateText(candidate, must(parseText(position)), style)];
}
