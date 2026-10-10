import { coloured, plain } from '#src/recap/render/wrap.ts';
import type { Style } from '#src/recap/render/wrap.ts';

export interface ColourStream {
    readonly hasColors?: (env?: object) => boolean;
}

export const styleFor = (stream: ColourStream, env: NodeJS.ProcessEnv = process.env): Style => (stream.hasColors?.(env) === true ? coloured : plain);
