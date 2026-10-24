import type Redis from "ioredis";
import type {AlertThrottle} from "../../domain/mail";

export default class RedisAlertThrottle implements AlertThrottle {
    constructor(private redis: Redis) {
    }

    async claim(key: string, seconds: number): Promise<boolean> {
        return await this.redis.set(`alert:${key}`, "1", "EX", seconds, "NX") === "OK"
    }
}
