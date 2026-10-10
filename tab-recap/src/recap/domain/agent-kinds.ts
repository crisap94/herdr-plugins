export interface AgentKindCapabilities {
    readonly compactable: boolean;
    readonly defaultPolicy: boolean;
    readonly autocompactDefault: boolean;
}

export const AGENT_KINDS = {
    claude: { compactable: true, defaultPolicy: true, autocompactDefault: true },
    codex: { compactable: true, defaultPolicy: true, autocompactDefault: false },
    opencode: { compactable: true, defaultPolicy: true, autocompactDefault: false },
} as const satisfies Readonly<Record<string, AgentKindCapabilities>>;

export type AgentKind = keyof typeof AGENT_KINDS;

export function kindsWith(capability: keyof AgentKindCapabilities): readonly AgentKind[] {
    return (Object.keys(AGENT_KINDS) as AgentKind[]).filter((kind) => AGENT_KINDS[kind][capability]);
}
