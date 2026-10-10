import type { Labelled } from '#src/experiment/kappa-report.ts';
import { readJsonl } from './experiment-io.ts';
import type { Point } from './experiment-point.ts';

export const readPoints = (path: string): readonly Point[] => readJsonl(path) as readonly Point[];
export const readLabelled = (path: string): readonly Labelled[] => readJsonl(path) as readonly Labelled[];
