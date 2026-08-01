export const OPERATOR_TIME_ZONE = 'America/New_York';
export const CHINA_TIME_ZONE = 'Asia/Shanghai';
export const SLOT_MINUTES = 30;

export type ScheduledValue =
  | { kind: 'empty' }
  | { kind: 'date-only'; date: string }
  | { kind: 'instant'; instant: Date }
  | { kind: 'invalid'; value: string };

export interface ScheduleSlot {
  instant: string;
  etDate: string;
  etTime: string;
}

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function dateTimeFormatter(timeZone: string) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
}

function zonedParts(value: Date, timeZone: string): Record<string, string> {
  return Object.fromEntries(
    dateTimeFormatter(timeZone)
      .formatToParts(value)
      .filter(part => part.type !== 'literal')
      .map(part => [part.type, part.value]),
  );
}

function wallKey(value: Date, timeZone: string): string {
  const parts = zonedParts(value, timeZone);
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

export function parseScheduledValue(value: string | null | undefined): ScheduledValue {
  if (!value) return { kind: 'empty' };
  if (DATE_ONLY_PATTERN.test(value)) return { kind: 'date-only', date: value };
  const instant = new Date(value);
  return Number.isNaN(instant.getTime())
    ? { kind: 'invalid', value }
    : { kind: 'instant', instant };
}

export function zonedDateTimeToIso(
  date: string,
  time: string,
  timeZone = OPERATOR_TIME_ZONE,
): string | null {
  if (!DATE_ONLY_PATTERN.test(date) || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    return null;
  }

  const target = `${date}T${time}`;
  const naiveUtc = Date.parse(`${target}:00Z`);
  const matches: Date[] = [];
  for (let minutes = -16 * 60; minutes <= 16 * 60; minutes += SLOT_MINUTES) {
    const candidate = new Date(naiveUtc + minutes * 60_000);
    if (wallKey(candidate, timeZone) === target) matches.push(candidate);
  }

  return matches[0]?.toISOString() ?? null;
}

export function formatInTimeZone(
  value: string | Date,
  timeZone: string,
  options: Intl.DateTimeFormatOptions,
): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return 'Invalid date';
  return new Intl.DateTimeFormat('en-US', { timeZone, ...options }).format(date);
}

export function formatEtTime(value: string | Date): string {
  return formatInTimeZone(value, OPERATOR_TIME_ZONE, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatChinaCompact(value: string | Date): string {
  return formatInTimeZone(value, CHINA_TIME_ZONE, {
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatChinaPreview(value: string | Date): string {
  return formatInTimeZone(value, CHINA_TIME_ZONE, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

export function etDate(value: string | Date): string {
  if (typeof value === 'string' && DATE_ONLY_PATTERN.test(value)) return value;
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '';
  const parts = zonedParts(date, OPERATOR_TIME_ZONE);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function etTime(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '';
  const parts = zonedParts(date, OPERATOR_TIME_ZONE);
  return `${parts.hour}:${parts.minute}`;
}

export function addCalendarDays(date: string, days: number): string {
  if (!DATE_ONLY_PATTERN.test(date)) return '';
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function todayInEt(now = new Date()): string {
  return etDate(now);
}

export function buildEveningSlots(
  date: string,
  startHour = 17,
  endHour = 23,
): ScheduleSlot[] {
  const slots: ScheduleSlot[] = [];
  for (let hour = startHour; hour <= endHour; hour += 1) {
    for (const minute of [0, SLOT_MINUTES]) {
      const time = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
      const instant = zonedDateTimeToIso(date, time);
      if (instant) slots.push({ instant, etDate: date, etTime: time });
    }
  }
  return slots;
}

export function isThirtyMinuteInstant(value: string): boolean {
  const parsed = parseScheduledValue(value);
  return parsed.kind === 'instant' && Number(etTime(parsed.instant).slice(3)) % SLOT_MINUTES === 0;
}
