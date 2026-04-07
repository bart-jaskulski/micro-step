import { createSignal } from "solid-js";
import { isServer } from "solid-js/web";

export type BreakdownGranularity = "low" | "medium" | "high";

export const BREAKDOWN_GRANULARITY_STORAGE_KEY = "microstep:breakdown-granularity";
export const DEFAULT_BREAKDOWN_GRANULARITY: BreakdownGranularity = "medium";
export const BREAKDOWN_GRANULARITY_OPTIONS: BreakdownGranularity[] = ["low", "medium", "high"];

export const parseBreakdownGranularity = (value: string | null): BreakdownGranularity => {
  if (value === "low" || value === "medium" || value === "high") {
    return value;
  }

  return DEFAULT_BREAKDOWN_GRANULARITY;
};

const readBreakdownGranularityPreference = () => {
  if (isServer || typeof window === "undefined") {
    return DEFAULT_BREAKDOWN_GRANULARITY;
  }

  try {
    return parseBreakdownGranularity(
      window.localStorage.getItem(BREAKDOWN_GRANULARITY_STORAGE_KEY)
    );
  } catch (error) {
    console.warn("Failed to read breakdown granularity preference:", error);
    return DEFAULT_BREAKDOWN_GRANULARITY;
  }
};

const writeBreakdownGranularityPreference = (value: BreakdownGranularity) => {
  if (isServer || typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(BREAKDOWN_GRANULARITY_STORAGE_KEY, value);
  } catch (error) {
    console.warn("Failed to persist breakdown granularity preference:", error);
  }
};

const [breakdownGranularity, setBreakdownGranularitySignal] = createSignal<BreakdownGranularity>(
  readBreakdownGranularityPreference()
);

export { breakdownGranularity };

export const setBreakdownGranularity = (value: BreakdownGranularity) => {
  setBreakdownGranularitySignal(value);
  writeBreakdownGranularityPreference(value);
};
