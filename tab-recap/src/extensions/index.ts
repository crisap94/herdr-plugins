import { atalayaBridge } from './atalaya-bridge.ts';
import type { ExtensionFactory } from '#src/ports/extension.ts';

export const FACTORIES: readonly ExtensionFactory[] = [atalayaBridge];
