// Tasks within a tab: one piece of work and the recap drawn for it. Pure.
import type { RecapSections } from './shape.ts';

/** One piece of work in a tab and its one recap. `sections` is null (and `markdown` all there is) for a recap stored before the fixed structure. */
export interface RecapTask {
    readonly id: string;
    /** blank when the tab has a single task */
    readonly name: string;
    readonly lanes: readonly string[];
    readonly sections: RecapSections | null;
    /** the sections drawn in the recap language */
    readonly markdown: string;
}
