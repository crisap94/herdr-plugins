export const JEV_KEY_FILE = ['.config', 'typesafe-api-key'] as const;

const clean = (raw: string | null | undefined): string | null => {
    const key = (raw ?? '').trim();
    return key === '' ? null : key;
};

export function jevKey(get: (key: string) => string | undefined, read: (path: string) => string | null, home: string): string | null {
    return clean(get('TAB_RECAP_JEV_KEY')) ?? clean(get('TYPESAFE_API_KEY')) ?? clean(read([home, ...JEV_KEY_FILE].join('/'))?.split('\n')[0]);
}
