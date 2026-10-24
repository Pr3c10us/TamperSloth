import type {AlertThrottle, Mailer} from "../../domain/mail";
import BillingAlertEmail from "../../../packages/emails/billingAlertEmail.ts";

const ONE_HOUR = 60 * 60

/** Emails the alert address when billing needs a person; one email per key an hour. */
export default class BillingAlerts {
    constructor(
        private mailer: Mailer,
        private throttle: AlertThrottle,
        private to: string,
    ) {
    }

    async send(key: string, title: string, detail: string) {
        console.error(`billing alert: ${title}: ${detail}`)
        try {
            if (!await this.throttle.claim(`billing:${key}`, ONE_HOUR)) return
            await this.mailer.send({to: this.to, ...BillingAlertEmail(title, detail)})
        } catch (error) {
            console.error("failed to send a billing alert", error)
        }
    }
}
