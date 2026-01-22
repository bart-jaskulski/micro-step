import { createEffect, createSignal, onCleanup } from "solid-js";
import { getDb } from "./db";

type QueryCallback = () => any;

export const createReactiveQuery = <T = any>(
  queryFn: QueryCallback,
  dependencies: any[] = []
) => {
  const [data, setData] = createSignal<T | null>(null);
  const [isLoading, setIsLoading] = createSignal(true);
  const [error, setError] = createSignal<Error | null>(null);

  let isMounted = true;

  const executeQuery = async () => {
    if (!isMounted) return;

    try {
      setIsLoading(true);
      setError(null);
      const result = await queryFn();
      
      if (isMounted) {
        setData(result);
      }
    } catch (err) {
      if (isMounted) {
        setError(err as Error);
      }
    } finally {
      if (isMounted) {
        setIsLoading(false);
      }
    }
  };

  createEffect(() => {
    executeQuery();
  });

  onCleanup(() => {
    isMounted = false;
  });

  return { data, isLoading, error, refetch: executeQuery };
};

export const createLiveQuery = <T = any>(sql: string, params: any[] = []) => {
  const [data, setData] = createSignal<T[]>([]);
  const [isLoading, setIsLoading] = createSignal(true);

  const executeQuery = async () => {
    try {
      const db = await getDb();
      const result = db.exec(sql, params);
      setData(result);
    } catch (err) {
      console.error("Live query error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  executeQuery();

  return { data, isLoading, refetch: executeQuery };
};
