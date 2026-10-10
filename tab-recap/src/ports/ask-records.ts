export interface AskRecords {
    seen(tool: string, id: string): boolean;
    remember(tool: string, id: string, pane: string): void;
    prune(at: number): void;
}
