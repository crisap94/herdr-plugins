import type { Labelled as LabelledRow } from '#src/experiment/kappa-report.ts';
import type { Text } from '#src/recap/domain/text.ts';

import { readJsonl } from './io.ts';
import type { Point } from './point.ts';

export const readPoints = (path: Text): readonly Point[] => readJsonl(path) as readonly Point[];
export const readLabelled = (path: Text): readonly LabelledRow[] => readJsonl(path) as readonly LabelledRow[];
