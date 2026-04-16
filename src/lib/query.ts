import { createEffect, createSignal, onCleanup } from "solid-js";
import { exec, query } from "./db";

export const MAIN_VIEW_QUERY = `
SELECT *,
  CASE
    WHEN updated_at = created_at
     AND created_at < (strftime('%s', 'now') * 1000 - 7*24*60*60*1000)
    THEN 1
    ELSE 0
  END as is_stalled
FROM tasks
WHERE workspace_id = ?
ORDER BY
  CASE WHEN due_at IS NULL THEN 1 ELSE 0 END ASC,
  due_at DESC,
  created_at DESC,
  rank ASC
`;

export const fetchMainViewTasks = <T = any>(workspaceId: string): Promise<T[]> =>
  query<T>(MAIN_VIEW_QUERY, [workspaceId]);

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
      const result = await query<T>(sql, params);
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
