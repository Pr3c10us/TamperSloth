import type Redis from "ioredis";
import type Services from "../../services";

const RECONCILE_EVERY_MS = 10 * 60_000
const FIRST_RUN_AFTER_MS = 60_000

/** Background work on a timer; a Redis lock lets one server instance run each pass. */
export default class Jobs {
    constructor(
        private services: Services,
        private redis: Redis,
    ) {
    }

    start() {
        setTimeout(() => void this.reconcileBilling(), FIRST_RUN_AFTER_MS)
        setInterval(() => void this.reconcileBilling(), RECONCILE_EVERY_MS)
    }

    private async reconcileBilling() {
        const locked = await this.redis.set("jobs:billing-reconcile", String(process.pid), "PX", RECONCILE_EVERY_MS - 30_000, "NX")
            .catch(() => null)
        if (locked !== "OK") return
        try {
            await this.services.billingService.commands.reconcile.handle()
        } catch (error) {
            console.error("billing reconcile failed", error)
        }
    }
}
