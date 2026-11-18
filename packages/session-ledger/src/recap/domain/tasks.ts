import type { RecapSections } from './shape.ts';

export interface RecapTask {
    readonly id: string;
    readonly name: string;
    readonly lanes: readonly string[];
    readonly sections: RecapSections | null;
    readonly markdown: string;
}
