// @ts-expect-error the fixture is wrong on purpose
export const value: number = "text";
/// <reference types="node" />
// oxlint-disable-next-line no-console
export const text = "a // inside a string is not a comment";
export const pattern = /\/\/ not a comment/;
