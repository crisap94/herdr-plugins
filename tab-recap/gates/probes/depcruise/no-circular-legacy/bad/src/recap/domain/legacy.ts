import { typed } from './a.ts';
import { twice } from '#src/recap/application/b.ts';

export const old = (n: number): number => typed(n) + twice(n);
