const DAY = 86_400_000;

export const startOfDayUTC = (d = new Date()) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
export const startOfMonthUTC = (d = new Date()) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
export const daysInMonthUTC = (d = new Date()) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
export const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY);
export const isoDay = (d: Date) => d.toISOString().slice(0, 10);
export const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 500);
