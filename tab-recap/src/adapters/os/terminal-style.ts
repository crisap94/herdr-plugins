import { coloured, plain } from '@stateforge-labs/recap-view/unstable/wrap.ts';
import type { Style } from '@stateforge-labs/recap-view/unstable/wrap.ts';

export type ColourStream = Partial<Pick<NodeJS.WriteStream, 'hasColors'>>;

export const styleFor = (stream: ColourStream, env: NodeJS.ProcessEnv = process.env): Style => (stream.hasColors?.(env) === true ? coloured : plain);
