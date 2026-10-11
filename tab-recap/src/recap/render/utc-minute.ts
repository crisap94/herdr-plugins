export const utcMinuteText = (ms: number): string => `${new Date(ms).toISOString().slice(0, 16).replace('T', ' ')}Z`;
