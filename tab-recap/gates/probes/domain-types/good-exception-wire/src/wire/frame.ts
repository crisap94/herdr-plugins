export interface Frame { readonly rows: number; readonly lines: readonly string[] }

export function blank(frame: Frame): Frame {
    return frame;
}
