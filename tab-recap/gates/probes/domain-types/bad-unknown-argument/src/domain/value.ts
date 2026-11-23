export type Thing = 'a' | 'b';

export function parseThing(input: Promise<unknown>): Thing {
    void input;
    return 'a';
}
