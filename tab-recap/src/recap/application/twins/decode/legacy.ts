export interface PaneSession {
    readonly pane: string;
    readonly session: string;
}

export interface PaneTokens {
    readonly pane: string;
    readonly tokens: Readonly<Record<string, string>>;
}
