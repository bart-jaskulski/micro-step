import { createSignal } from "solid-js";
import { isServer } from "solid-js/web";

export type BreakdownGranularity = "low" | "medium" | "high";
export type ListFilter = "all" | "active" | "completed" | "stalled";
export type ListSortMode = "manual" | "due-date";

export const BREAKDOWN_GRANULARITY_STORAGE_KEY = "microstep:breakdown-granularity";
export const DEFAULT_BREAKDOWN_GRANULARITY: BreakdownGranularity = "medium";
export const BREAKDOWN_GRANULARITY_OPTIONS: BreakdownGranularity[] = ["low", "medium", "high"];
export const LIST_FILTER_STORAGE_KEY = "microstep:list-filter";
export const DEFAULT_LIST_FILTER: ListFilter = "all";
export const LIST_FILTER_OPTIONS: ListFilter[] = ["all", "active", "completed", "stalled"];
export const LIST_SORT_MODE_STORAGE_KEY = "microstep:list-sort-mode";
export const DEFAULT_LIST_SORT_MODE: ListSortMode = "manual";
export const LIST_SORT_MODE_OPTIONS: ListSortMode[] = ["manual", "due-date"];

export const parseBreakdownGranularity = (value: string | null): BreakdownGranularity => {
  if (value === "low" || value === "medium" || value === "high") {
    return value;
  }

  return DEFAULT_BREAKDOWN_GRANULARITY;
};

export const parseListFilter = (value: string | null): ListFilter => {
  if (value === "all" || value === "active" || value === "completed" || value === "stalled") {
    return value;
  }

  return DEFAULT_LIST_FILTER;
};

export const parseListSortMode = (value: string | null): ListSortMode => {
  if (value === "manual" || value === "due-date") {
    return value;
  }

  return DEFAULT_LIST_SORT_MODE;
};

const readPreference = <T>(storageKey: string, parser: (value: string | null) => T, fallback: T) => {
  if (isServer || typeof window === "undefined") {
    return fallback;
  }

  try {
    return parser(window.localStorage.getItem(storageKey));
  } catch (error) {
    console.warn(`Failed to read preference for ${storageKey}:`, error);
    return fallback;
  }
};

const writePreference = (storageKey: string, value: string) => {
  if (isServer || typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(storageKey, value);
  } catch (error) {
    console.warn(`Failed to persist preference for ${storageKey}:`, error);
  }
};

const [breakdownGranularity, setBreakdownGranularitySignal] = createSignal<BreakdownGranularity>(
  readPreference(
    BREAKDOWN_GRANULARITY_STORAGE_KEY,
    parseBreakdownGranularity,
    DEFAULT_BREAKDOWN_GRANULARITY,
  )
);
const [listFilter, setListFilterSignal] = createSignal<ListFilter>(
  readPreference(LIST_FILTER_STORAGE_KEY, parseListFilter, DEFAULT_LIST_FILTER)
);
const [listSortMode, setListSortModeSignal] = createSignal<ListSortMode>(
  readPreference(LIST_SORT_MODE_STORAGE_KEY, parseListSortMode, DEFAULT_LIST_SORT_MODE)
);

export { breakdownGranularity };
export { listFilter, listSortMode };

export const setBreakdownGranularity = (value: BreakdownGranularity) => {
  setBreakdownGranularitySignal(value);
  writePreference(BREAKDOWN_GRANULARITY_STORAGE_KEY, value);
};

export const setListFilter = (value: ListFilter) => {
  setListFilterSignal(value);
  writePreference(LIST_FILTER_STORAGE_KEY, value);
};

export const setListSortMode = (value: ListSortMode) => {
  setListSortModeSignal(value);
  writePreference(LIST_SORT_MODE_STORAGE_KEY, value);
};
