import type Redis from "ioredis";
import type {RateLimiter} from "../../domain/model/provider.ts";
import {TooManyRequestsError} from "../../../packages/errors";

const WINDOW_MS = 60_000
/** A request whose process dies before releasing frees its slot after this long. */
const LEASE_MS = 15 * 60_000

// KEYS: started requests (scored by start), active leases (scored by expiry).
// ARGV: window ms, requests per minute, max concurrent, lease ms, request id.
// Returns {0} when admitted, {1} at the concurrency cap, {2, retry ms} at the per-minute cap.
const ACQUIRE = `
local time = redis.call("TIME")
local now = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)
local window = tonumber(ARGV[1])
local lease = tonumber(ARGV[4])

redis.call("ZREMRANGEBYSCORE", KEYS[1], "-inf", now - window)
redis.call("ZREMRANGEBYSCORE", KEYS[2], "-inf", now)

if redis.call("ZCARD", KEYS[2]) >= tonumber(ARGV[3]) then
    return {1, 0}
end
if redis.call("ZCARD", KEYS[1]) >= tonumber(ARGV[2]) then
    local oldest = redis.call("ZRANGE", KEYS[1], 0, 0, "WITHSCORES")
    return {2, tonumber(oldest[2]) + window - now}
end

redis.call("ZADD", KEYS[1], now, ARGV[5])
redis.call("ZADD", KEYS[2], now + lease, ARGV[5])
redis.call("PEXPIRE", KEYS[1], window)
redis.call("PEXPIRE", KEYS[2], lease)
return {0, 0}
`

export default class RedisRateLimiter implements RateLimiter {
    constructor(private redis: Redis) {
    }

    async acquire(userId: string, limits: { requestsPerMinute: number, maxConcurrent: number }) {
        const startedKey = `ratelimit:{${userId}}:started`
        const activeKey = `ratelimit:{${userId}}:active`
        const requestId = crypto.randomUUID()

        const [outcome, retryMs] = await this.redis.eval(
            ACQUIRE, 2, startedKey, activeKey,
            WINDOW_MS, limits.requestsPerMinute, limits.maxConcurrent, LEASE_MS, requestId,
        ) as [number, number]

        if (outcome === 1) {
            throw new TooManyRequestsError(`Only ${limits.maxConcurrent} requests can run at once on your plan.`, 5)
        }
        if (outcome === 2) {
            throw new TooManyRequestsError(`You've reached ${limits.requestsPerMinute} requests a minute on your plan.`, retryMs / 1000)
        }

        let released = false
        return () => {
            if (released) return
            released = true
            this.redis.zrem(activeKey, requestId)
                .catch(error => console.error("failed to release rate limit slot", error))
        }
    }
}
