const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

const isValidDateOnly = (year: number, monthIndex: number, day: number, timestamp: number) => {
  const date = new Date(timestamp);

  return date.getUTCFullYear() === year
    && date.getUTCMonth() === monthIndex
    && date.getUTCDate() === day;
};

const localDateOnlyTimestamp = (date: Date) =>
  Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());

export const normalizeDateOnlyInput = (value: string): number | null => {
  const match = DATE_ONLY_PATTERN.exec(value.trim());
  if (!match) {
    return null;
  }

  const year = Number.parseInt(match[1] ?? "", 10);
  const month = Number.parseInt(match[2] ?? "", 10);
  const day = Number.parseInt(match[3] ?? "", 10);
  const timestamp = Date.UTC(year, month - 1, day);

  if (!isValidDateOnly(year, month - 1, day, timestamp)) {
    return null;
  }

  return timestamp;
};

export const normalizeDueDateValue = (value?: string | number | null): number | null => {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  const dateOnly = normalizeDateOnlyInput(value);
  if (dateOnly !== null) {
    return dateOnly;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return Date.UTC(
    parsed.getUTCFullYear(),
    parsed.getUTCMonth(),
    parsed.getUTCDate(),
  );
};

export const formatDueDateLabel = (dueAt: number, now: Date = new Date()) => {
  const today = localDateOnlyTimestamp(now);
  if (dueAt === today) {
    return "Today";
  }

  if (dueAt === today + DAY_MS) {
    return "Tomorrow";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(dueAt);
};

export const formatDateInputValue = (dueAt: number | null) => {
  if (dueAt === null) {
    return "";
  }

  return new Date(dueAt).toISOString().slice(0, 10);
};
