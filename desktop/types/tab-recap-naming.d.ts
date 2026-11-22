export interface NamedStory {
    readonly text?: string;
    readonly at?: number;
}
export interface NamedTask {
    readonly story?: NamedStory | null;
}
export interface NameSources {
    readonly tasks?: readonly NamedTask[] | null;
    readonly topic?: string;
    readonly agentTitle?: string;
    readonly label?: string;
    readonly id?: string;
}
export declare function clipName(text: string | null | undefined, max?: number): string;
export declare function storyTitle(tasks: readonly NamedTask[] | null | undefined): string;
export declare function sessionName(sources: NameSources): string;
