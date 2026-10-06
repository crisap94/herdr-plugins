export const MIN_NODE: string;
export function nodeAtLeast(version: string, minimum?: string): boolean;
export function guardNode(kind: 'daemon' | 'pane' | 'command', host?: { version?: string; path?: string; argv?: readonly string[] }): Promise<void>;
