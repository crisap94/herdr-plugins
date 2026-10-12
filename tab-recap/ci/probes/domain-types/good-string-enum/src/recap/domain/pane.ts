export enum Level {
    Low = 'low',
    High = 'high',
}

export function flip(level: Level): Level {
    return level === Level.Low ? Level.High : Level.Low;
}
