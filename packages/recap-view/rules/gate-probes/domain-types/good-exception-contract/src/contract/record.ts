export interface Row { readonly name: string; readonly tags: readonly string[] }

export interface Rows {
    read(name: string): Row | null;
    names(): readonly string[];
}
