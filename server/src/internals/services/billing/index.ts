import type Adapters from "../../adapters";
import CreateCheckout from "./commands/createCheckout.ts";
import ChangePlan from "./commands/changePlan.ts";
import ResumePlan from "./commands/resumePlan.ts";
import OpenPortal from "./commands/openPortal.ts";
import HandlePaddleWebhook from "./commands/handlePaddleWebhook.ts";
import Reconcile from "./commands/reconcile.ts";
import GetBilling from "./query/getBilling.ts";
import GetPlans from "./query/getPlans.ts";
import PlanPrices from "./prices.ts";
import BillingAlerts from "./alerts.ts";

export class Commands {
    createCheckout: CreateCheckout
    changePlan: ChangePlan
    resumePlan: ResumePlan
    openPortal: OpenPortal
    handlePaddleWebhook: HandlePaddleWebhook
    reconcile: Reconcile

    constructor(adapters: Adapters) {
        const {paymentGateway, subscriptionRepository, usageRepository} = adapters
        const secrets = adapters.parameters.appSecrets
        const prices = new PlanPrices(secrets.paddleCredentials.prices)
        const alerts = new BillingAlerts(adapters.mailer, adapters.alertThrottle, secrets.spendAlertEmail)
        this.createCheckout = new CreateCheckout(paymentGateway, subscriptionRepository, prices)
        this.changePlan = new ChangePlan(paymentGateway, subscriptionRepository, usageRepository, prices, alerts, secrets.creditsPerUsd)
        this.resumePlan = new ResumePlan(paymentGateway, subscriptionRepository)
        this.openPortal = new OpenPortal(paymentGateway, subscriptionRepository)
        this.handlePaddleWebhook = new HandlePaddleWebhook(paymentGateway, subscriptionRepository, prices, alerts)
        this.reconcile = new Reconcile(paymentGateway, subscriptionRepository, this.handlePaddleWebhook, alerts)
    }
}

export class Queries {
    getBilling: GetBilling
    getPlans: GetPlans

    constructor(adapters: Adapters) {
        const secrets = adapters.parameters.appSecrets
        this.getBilling = new GetBilling(adapters.subscriptionRepository)
        this.getPlans = new GetPlans(secrets.runTokenBudgets, secrets.creditsPerUsd)
    }
}

export default class BillingService {
    commands: Commands
    queries: Queries

    constructor(adapters: Adapters) {
        this.commands = new Commands(adapters)
        this.queries = new Queries(adapters)
    }
}
