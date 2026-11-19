export interface SeenLane {
    readonly paneId: string;
    readonly tabId: string;
    readonly workspaceId: string;
    readonly agent: string;
    readonly status?: string | null | undefined;
    readonly session?: string | null | undefined;
    readonly cwd?: string | null | undefined;
    readonly title?: string | null | undefined;
}
