import type { LabelledMoment } from '#src/experiment/kappa-report.ts';
import type { Label } from '#src/experiment/stats.ts';
import { textOf, type Text } from '#src/recap/domain/text.ts';

import { readJsonl } from './io.ts';
import type { Point } from './point.ts';

interface LabelledRecord { readonly id: string; readonly labels: Readonly<Record<string, Label>> }

export const readPoints = (path: Text): readonly Point[] => readJsonl(path) as readonly Point[];
export const readLabelled = (path: Text): readonly LabelledMoment[] =>
    (readJsonl(path) as readonly LabelledRecord[]).map((row) => ({ id: textOf(row.id), labels: new Map(Object.entries(row.labels).map(([name, label]) => [textOf(name), label])) }));
