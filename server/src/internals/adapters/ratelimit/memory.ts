import type {RateLimiter} from "../../domain/model/provider.ts";
import {TooManyRequestsError} from "../../../packages/errors";

const WINDOW_MS = 60_000

type Bucket = { started: number[], active: number }

/**
 * Sliding one-minute window plus a concurrency cap, per user, in this process.
 * Enough for a single instance; behind several, swap in a Redis-backed limiter.
 */
export default class MemoryRateLimiter implements RateLimiter {
    private buckets = new Map<string, Bucket>()

    acquire(userId: string, limits: { requestsPerMinute: number, maxConcurrent: number }) {
        const now = Date.now()
        const bucket = this.buckets.get(userId) ?? {started: [], active: 0}
        bucket.started = bucket.started.filter(at => now - at < WINDOW_MS)

        if (bucket.active >= limits.maxConcurrent) {
            this.buckets.set(userId, bucket)
            throw new TooManyRequestsError(`Only ${limits.maxConcurrent} requests can run at once on your plan.`, 5)
        }
        if (bucket.started.length >= limits.requestsPerMinute) {
            this.buckets.set(userId, bucket)
            const retryAfter = (bucket.started[0]! + WINDOW_MS - now) / 1000
            throw new TooManyRequestsError(`You've reached ${limits.requestsPerMinute} requests a minute on your plan.`, retryAfter)
        }

        bucket.started.push(now)
        bucket.active++
        this.buckets.set(userId, bucket)

        let released = false
        return () => {
            if (released) return
            released = true
            bucket.active--
            if (bucket.active === 0 && bucket.started.every(at => Date.now() - at >= WINDOW_MS)) {
                this.buckets.delete(userId)
            }
        }
    }
}
