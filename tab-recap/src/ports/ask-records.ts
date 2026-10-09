// The compaction requests tab-recap has accepted from other tools, by (tool, id): an id is acted on once, across daemon restarts.
export interface AskRecords {
    /** true when this tool's id was accepted before (or when the store cannot tell: an id is then not acted on) */
    seen(tool: string, id: string): boolean;
    /** the id is accepted now, on `pane` */
    remember(tool: string, id: string, pane: string): void;
}
