const DAY_MS = 24 * 60 * 60 * 1000;

export const STALLED_TASK_THRESHOLD_MS = 7 * DAY_MS;

type PriorityBucket = 0 | 1 | 2 | 3 | 4 | 5;

type PriorityKey = {
  bucket: PriorityBucket;
  distance: number;
  createdAt: number;
  dueAt: number | null;
  rank: string;
};

export type PriorityTask = {
  completed: boolean;
  createdAt: number;
  dueAt: number | null;
  rank: string;
  children?: PriorityTask[];
};

export const isTaskStalledForMainView = (
  task: Pick<PriorityTask, "completed" | "createdAt">,
  now: number = Date.now(),
) => !task.completed && now - task.createdAt >= STALLED_TASK_THRESHOLD_MS;

const getOwnPriorityKey = (task: PriorityTask, now: number): PriorityKey => {
  if (task.completed) {
    return {
      bucket: 5,
      distance: -task.createdAt,
      createdAt: task.createdAt,
      dueAt: task.dueAt,
      rank: task.rank,
    };
  }

  if (task.dueAt !== null) {
    const distanceFromDueDate = Math.abs(now - task.dueAt);

    if (task.dueAt < now) {
      return {
        bucket: 0,
        distance: distanceFromDueDate,
        createdAt: task.createdAt,
        dueAt: task.dueAt,
        rank: task.rank,
      };
    }

    if (task.dueAt >= now) {
      return {
        bucket: 1,
        distance: task.dueAt - now,
        createdAt: task.createdAt,
        dueAt: task.dueAt,
        rank: task.rank,
      };
    }

    return {
      bucket: 2,
      distance: distanceFromDueDate,
      createdAt: task.createdAt,
      dueAt: task.dueAt,
      rank: task.rank,
    };
  }

  if (isTaskStalledForMainView(task, now)) {
    return {
      bucket: 3,
      distance: task.createdAt,
      createdAt: task.createdAt,
      dueAt: task.dueAt,
      rank: task.rank,
    };
  }

  return {
    bucket: 4,
    distance: -task.createdAt,
    createdAt: task.createdAt,
    dueAt: task.dueAt,
    rank: task.rank,
  };
};

const comparePriorityKeys = (a: PriorityKey, b: PriorityKey) => {
  if (a.bucket !== b.bucket) {
    return a.bucket - b.bucket;
  }

  if (a.distance !== b.distance) {
    return a.distance - b.distance;
  }

  if (a.bucket === 3 && a.createdAt !== b.createdAt) {
    return a.createdAt - b.createdAt;
  }

  if (a.createdAt !== b.createdAt) {
    return b.createdAt - a.createdAt;
  }

  if (a.dueAt !== b.dueAt) {
    return (a.dueAt ?? Number.POSITIVE_INFINITY) - (b.dueAt ?? Number.POSITIVE_INFINITY);
  }

  return a.rank.localeCompare(b.rank);
};

export const createTaskPriorityComparator = <T extends PriorityTask>(now: number = Date.now()) => {
  const cache = new WeakMap<T, PriorityKey>();

  const resolvePriorityKey = (task: T): PriorityKey => {
    const cached = cache.get(task);
    if (cached) {
      return cached;
    }

    let bestKey = getOwnPriorityKey(task, now);

    for (const child of task.children ?? []) {
      const childKey = resolvePriorityKey(child as T);
      if (comparePriorityKeys(childKey, bestKey) < 0) {
        bestKey = childKey;
      }
    }

    cache.set(task, bestKey);
    return bestKey;
  };

  return (a: T, b: T) => comparePriorityKeys(resolvePriorityKey(a), resolvePriorityKey(b));
};
