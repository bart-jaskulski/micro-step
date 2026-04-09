export type RateLimitPolicy = {
  id: string;
  maxRequests: number;
  windowMs: number;
};

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

type RateLimitResult =
  | {
      allowed: true;
    }
  | {
      allowed: false;
      retryAfterMs: number;
    };

const UNKNOWN_CLIENT = "unknown";
const UNKNOWN_USER_AGENT = "unknown";
const USER_AGENT_MAX_LENGTH = 200;
const PRUNE_INTERVAL = 100;

const rateLimitBuckets = new Map<string, RateLimitBucket>();
let accessCount = 0;

const normalizeUserAgent = (value: string | null) => {
  const normalized = value?.trim().toLowerCase().replace(/\s+/g, " ") ?? "";
  return normalized ? normalized.slice(0, USER_AGENT_MAX_LENGTH) : UNKNOWN_USER_AGENT;
};

const normalizeClientAddress = (value: string | null | undefined) => {
  const normalized = value?.trim().replace(/^"|"$/g, "").replace(/^\[|\]$/g, "") ?? "";
  return normalized || UNKNOWN_CLIENT;
};

const parseForwardedHeader = (value: string | null) => {
  if (!value) {
    return null;
  }

  const firstEntry = value.split(",")[0]?.trim() ?? "";
  const match = firstEntry.match(/for=(?:"?\[?([^;\]",]+)\]?)/i);
  return normalizeClientAddress(match?.[1] ?? null);
};

const getRequestClientAddress = (request: Request, fallbackAddress?: string) => {
  const forwarded = parseForwardedHeader(request.headers.get("forwarded"));
  if (forwarded && forwarded !== UNKNOWN_CLIENT) {
    return forwarded;
  }

  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const firstForwarded = normalizeClientAddress(forwardedFor.split(",")[0]);
    if (firstForwarded !== UNKNOWN_CLIENT) {
      return firstForwarded;
    }
  }

  const proxyHeaders = ["cf-connecting-ip", "x-real-ip"] as const;
  for (const header of proxyHeaders) {
    const value = normalizeClientAddress(request.headers.get(header));
    if (value !== UNKNOWN_CLIENT) {
      return value;
    }
  }

  return normalizeClientAddress(fallbackAddress);
};

const getBucketState = (bucketId: string, policy: RateLimitPolicy, now: number) => {
  const current = rateLimitBuckets.get(bucketId);
  if (!current || current.resetAt <= now) {
    return {
      count: 0,
      resetAt: now + policy.windowMs,
    };
  }

  return current;
};

const pruneExpiredBuckets = (now: number) => {
  accessCount += 1;
  if (accessCount % PRUNE_INTERVAL !== 0) {
    return;
  }

  for (const [bucketId, bucket] of rateLimitBuckets) {
    if (bucket.resetAt <= now) {
      rateLimitBuckets.delete(bucketId);
    }
  }
};

export const buildRateLimitBucketKey = (
  request: Request,
  routeFamily: string,
  clientAddress?: string,
) => {
  const ip = getRequestClientAddress(request, clientAddress);
  const userAgent = normalizeUserAgent(request.headers.get("user-agent"));

  return `${routeFamily}:${ip}:${userAgent}`;
};

export const consumeRateLimit = (
  bucketKey: string,
  policies: readonly RateLimitPolicy[],
  now = Date.now(),
): RateLimitResult => {
  pruneExpiredBuckets(now);

  const nextBuckets = new Map<string, RateLimitBucket>();

  for (const policy of policies) {
    const bucketId = `${policy.id}:${bucketKey}`;
    const current = getBucketState(bucketId, policy, now);

    if (current.count + 1 > policy.maxRequests) {
      return {
        allowed: false,
        retryAfterMs: Math.max(current.resetAt - now, 0),
      };
    }

    nextBuckets.set(bucketId, {
      count: current.count + 1,
      resetAt: current.resetAt,
    });
  }

  for (const [bucketId, bucket] of nextBuckets) {
    rateLimitBuckets.set(bucketId, bucket);
  }

  return { allowed: true };
};

export const createRateLimitResponse = (message: string, retryAfterMs: number) => {
  const retryAfterSeconds = Math.max(1, Math.ceil(retryAfterMs / 1000));

  return Response.json(
    { error: message },
    {
      status: 429,
      headers: {
        "retry-after": String(retryAfterSeconds),
      },
    },
  );
};

export const resetRateLimitStore = () => {
  rateLimitBuckets.clear();
  accessCount = 0;
};
