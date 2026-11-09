export const CLAUDE_POLICY_ACKS = ['on', 'off'] as const;

export type ClaudePolicyAck = (typeof CLAUDE_POLICY_ACKS)[number];

export const CLAUDE_POLICY_ACK_DEFAULT: ClaudePolicyAck = 'off';
