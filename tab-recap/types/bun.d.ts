declare const Bun: {
    readonly TOML: { parse(text: string): unknown };
    stringWidth(text: string): number;
    readonly Transpiler: new (options: { readonly loader: 'ts'; readonly trimUnusedImports: boolean }) => { transformSync(source: string): string };
};
