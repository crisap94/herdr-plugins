declare module 'bun:sqlite' {
    export type SQLQueryBindings = string | number | bigint | boolean | null | Uint8Array;
    export type DatabaseOptions = {
        readonly?: boolean;
        readwrite?: boolean;
        create?: boolean;
        strict?: boolean;
        safeIntegers?: boolean;
    };
    export type Changes = { changes: number; lastInsertRowid: number | bigint };
    export class Statement {
        get(...params: SQLQueryBindings[]): Record<string, SQLQueryBindings> | null;
        all(...params: SQLQueryBindings[]): Record<string, SQLQueryBindings>[];
        values(...params: SQLQueryBindings[]): unknown[][];
        run(...params: SQLQueryBindings[]): Changes;
        finalize(): void;
    }
    export class Database {
        constructor(filename?: string, options?: DatabaseOptions);
        readonly inTransaction: boolean;
        exec(sql: string): void;
        prepare(sql: string): Statement;
        close(throwOnError?: boolean): void;
    }
}
