export type Fields = Readonly<Record<string, unknown>>;

export function isFields(input: unknown): input is Fields {
    return typeof input === 'object' && input !== null;
}
