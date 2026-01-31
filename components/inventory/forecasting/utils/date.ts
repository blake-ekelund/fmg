export function addMonths(date: Date, n: number) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + n);
  return d;
}

export function daysRemainingInMonth(date: Date) {
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return end.getDate() - date.getDate();
}

export function daysInMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}
