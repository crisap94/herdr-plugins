import { stateDir } from '../daemon/config.ts';

export const socketOf = (): string => `${stateDir()}/view.sock`;
