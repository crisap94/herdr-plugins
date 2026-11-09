export const LIBRARY_IDS = { claude: 'claude', codex: 'codex', opencode: 'opencode' } as const;

export const LIBRARY_HARNESS = {
    loginStore: 'login-store',
    harnessDefaultEffort: 'harness-default',
    failedCode: 1,
    detailLimit: 300,
    ackKey: 'TAB_RECAP_CLAUDE_POLICY_ACK',
    ackMessage: 'claude is not acknowledged: set TAB_RECAP_CLAUDE_POLICY_ACK=on to let the recap run on the Claude login, or choose another backend',
    timeoutKind: 'timeout',
    exitKind: 'exit',
} as const;

export const CONFINEMENT_NOTICE = {
    weakStates: ['emulated', 'unmeasured'],
    unmeasuredCosts: ['unreported', 'unavailable'],
    cellSeparator: ', ',
    partSeparator: '; ',
} as const;
