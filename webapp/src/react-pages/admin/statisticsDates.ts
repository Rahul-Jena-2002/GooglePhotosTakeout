function timestamp(value: unknown): number | null {
  try {
    if (value && typeof value === 'object' && 'toMillis' in value && typeof value.toMillis === 'function') {
      value = value.toMillis();
    }
    if (typeof value !== 'number' && typeof value !== 'string' && !(value instanceof Date)) return null;
    if (typeof value === 'string' && !value.trim()) return null;
    const result = value instanceof Date ? value.getTime() : new Date(value).getTime();
    return Number.isFinite(result) ? result : null;
  } catch {
    return null;
  }
}

export function dailyRecoveries(records: Array<{ timestamp?: unknown }>, now = new Date()) {
  const dates = records.map(record => timestamp(record.timestamp)).filter((value): value is number => value !== null && value <= now.getTime());
  return Array.from({ length: 7 }, (_, index) => {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6 + index);
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1);
    return {
      label: start.toLocaleDateString('en-US', { weekday: 'short' }),
      value: dates.filter(date => date >= start.getTime() && date < end.getTime()).length
    };
  });
}

export function accountGrowth(records: Array<{ createdAt?: unknown }>, now = new Date()) {
  const dates = records.map(record => timestamp(record.createdAt)).filter((value): value is number => value !== null && value <= now.getTime());
  return Array.from({ length: 6 }, (_, index) => {
    const month = new Date(now.getFullYear(), now.getMonth() - 5 + index, 1);
    const nextMonth = new Date(month.getFullYear(), month.getMonth() + 1, 1);
    return {
      label: month.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
      value: dates.filter(date => date < nextMonth.getTime()).length
    };
  });
}
