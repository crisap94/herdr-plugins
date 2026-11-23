export function tag(id: string & { readonly tag: 1 }): number {
    return id.length;
}
