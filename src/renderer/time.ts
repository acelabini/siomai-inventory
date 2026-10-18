// SQLite stores UTC without a zone; browser records already carry one.
export const utcTimestamp = (value: string): string => /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)
  ? `${value.replace(' ', 'T')}Z` : value;
