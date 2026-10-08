// The TypeSafe API key, read at call time and nowhere else: never logged, stored, shown or put in an error.

/** The file the key may live in, under the home folder. */
export const JEV_KEY_FILE = ['.config', 'typesafe-api-key'] as const;

const clean = (raw: string | null | undefined): string | null => {
    const key = (raw ?? '').trim();
    return key === '' ? null : key;
};

/**
 * `TAB_RECAP_JEV_KEY` (the environment, then config.env: that is what `get` reads), else `TYPESAFE_API_KEY`, else the first line of the file
 * (`read` gets its path and answers its text, or null when it cannot).
 */
export function jevKey(get: (key: string) => string | undefined, read: (path: string) => string | null, home: string): string | null {
    return clean(get('TAB_RECAP_JEV_KEY')) ?? clean(get('TYPESAFE_API_KEY')) ?? clean(read([home, ...JEV_KEY_FILE].join('/'))?.split('\n')[0]);
}
