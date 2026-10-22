import type {DailySpend, SpendAlert, SpendLimitRepository} from "../../../domain/spend";
import type {Mailer} from "../../../domain/mail";
import {ServiceUnavailableError} from "../../../../packages/errors";
import SpendAlertEmail from "../../../../packages/emails/spendAlertEmail.ts";

export default class GlobalSpendLimit {
    constructor(
        private repository: SpendLimitRepository,
        private mailer: Mailer,
        private alertEmail: string,
    ) {
    }

    async ensureAvailable() {
        const today = await this.repository.today()
        if (today.spentMicros >= today.limitMicros) {
            if (!today.tripped) void this.alert("tripped", today)
            const error = new ServiceUnavailableError("Sloth models aren't available at the moment. Try again later.")
            error.code = "SLOTH_UNAVAILABLE"
            throw error
        }
        if (!today.warned && today.spentMicros >= today.limitMicros * today.alertPercent / 100) {
            void this.alert("warned", today)
        }
    }

    private async alert(alert: SpendAlert, today: DailySpend) {
        try {
            if (!await this.repository.claimAlert(alert)) return
            await this.mailer.send({to: this.alertEmail, ...SpendAlertEmail(alert, today)})
        } catch (error) {
            console.error(`failed to send the ${alert} spend alert`, error)
        }
    }
}
