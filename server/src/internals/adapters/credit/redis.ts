import type Redis from "ioredis";
import type {CreditHolds} from "../../domain/usage";

/** A hold whose process dies before releasing it lapses after this long, as a rate-limit lease does. */
const HOLD_MS = 15 * 60_000

// KEYS: the user's holds, members "<request id>:<micros>", scored by expiry.
// ARGV: spent micros, limit micros, this hold's micros, hold ms, request id.
// Returns 1 when held, 0 when it would pass the limit.
const HOLD = `
local time = redis.call("TIME")
local now = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)
redis.call("ZREMRANGEBYSCORE", KEYS[1], "-inf", now)

local held = 0
for _, member in ipairs(redis.call("ZRANGE", KEYS[1], 0, -1)) do
    held = held + tonumber(string.match(member, ":(%d+)$"))
end
if tonumber(ARGV[1]) + held + tonumber(ARGV[3]) > tonumber(ARGV[2]) then
    return 0
end

redis.call("ZADD", KEYS[1], now + tonumber(ARGV[4]), ARGV[5] .. ":" .. ARGV[3])
redis.call("PEXPIRE", KEYS[1], ARGV[4])
return 1
`

export default class RedisCreditHolds implements CreditHolds {
    constructor(private redis: Redis) {
    }

    async hold(userId: string, params: { spentMicros: number, limitMicros: number, micros: number }) {
        const key = `credit:{${userId}}:held`
        const requestId = crypto.randomUUID()
        const micros = Math.max(0, Math.ceil(params.micros))
        const member = `${requestId}:${micros}`
        const held = await this.redis.eval(
            HOLD, 1, key,
            Math.round(params.spentMicros), Math.round(params.limitMicros), micros, HOLD_MS, requestId,
        ) as number
        if (held !== 1) return null

        let released = false
        return () => {
            if (released) return
            released = true
            this.redis.zrem(key, member)
                .catch(error => console.error("failed to release credit hold", error))
        }
    }
}
