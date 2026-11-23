import type { LabelledMoment } from '#src/experiment/kappa-report.ts';
import type { Text } from '#src/recap/domain/text.ts';

import { parseLabelledRecord, parsePoint } from './decode.ts';
import { jsonLines } from './io.ts';
import type { Point } from './point.ts';

export const readPoints = (path: Text): readonly Point[] => jsonLines(path).map((line) => parsePoint(JSON.parse(line)));
export const readLabelled = (path: Text): readonly LabelledMoment[] => jsonLines(path).map((line) => parseLabelledRecord(JSON.parse(line)));
