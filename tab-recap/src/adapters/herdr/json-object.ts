export type Json = Readonly<Record<string, unknown>>;

export function parseJson(value: unknown): Json {
    return typeof value === 'object' && value !== null ? { ...value } : {};
}
