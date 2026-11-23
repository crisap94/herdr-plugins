import { coloured, plain } from '#src/recap/render/wrap.ts';
import type { Style } from '#src/recap/render/wrap.ts';

export type ColourStream = Partial<Pick<NodeJS.WriteStream, 'hasColors'>>;

export const styleFor = (stream: ColourStream, env: NodeJS.ProcessEnv = process.env): Style => (stream.hasColors?.(env) === true ? coloured : plain);
