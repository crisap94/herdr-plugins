declare module 'bun:sqlite' {
    export type DatabaseOptions = {
        readonly?: boolean;
        create?: boolean;
        safeIntegers?: boolean;
    };
    export class Database {
        constructor(filename: string, options?: DatabaseOptions);
        close(throwOnError?: boolean): void;
    }
}
