export const withoutLedgers = (document: string): string => document.replace(/<ledger\b[^>]*?(?:\/>|>[\s\S]*?<\/ledger>)/gu, '');
