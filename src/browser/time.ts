import { reportFilterSchema } from '../shared/schemas';

export function manilaBusinessDate(instant: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(instant);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)!.value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}

/** ISO UTC bounds for a Manila business day: inclusive start, exclusive end. */
export function manilaDayRange(date: string): { start: string; end: string } {
  reportFilterSchema.parse({ date });
  const start = new Date(`${date}T00:00:00.000+08:00`);
  return { start: start.toISOString(), end: new Date(start.valueOf() + 86_400_000).toISOString() };
}
