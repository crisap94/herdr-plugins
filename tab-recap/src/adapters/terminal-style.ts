// Whether this process's terminal wants colour: asked once, at a composition root, never by the renderer.
import { coloured, plain } from '#src/recap/render/wrap.ts';
import type { Style } from '#src/recap/render/wrap.ts';

export interface ColourStream {
    readonly hasColors?: (env?: object) => boolean;
}

/** `coloured` on a colour terminal, `plain` when it asks for none (`NO_COLOR`, `FORCE_COLOR=0`, `NODE_DISABLE_COLORS`) or is no terminal. */
export const styleFor = (stream: ColourStream, env: NodeJS.ProcessEnv = process.env): Style => (stream.hasColors?.(env) === true ? coloured : plain);
