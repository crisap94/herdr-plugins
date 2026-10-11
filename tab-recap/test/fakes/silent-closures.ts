import { closedDaysOf } from './closed-days.ts';

export const silentClosures = {
    closures: { record: (): void => undefined },
    events: { lane: (): void => undefined, inWorkspace: (): void => undefined },
    sharing: (): 'off' => 'off',
    closedDays: (): ReturnType<typeof closedDaysOf> => closedDaysOf('0'),
};
