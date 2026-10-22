import type Adapters from "../../adapters";
import CreateCheckout from "./commands/createCheckout.ts";
import ChangePlan from "./commands/changePlan.ts";
import OpenPortal from "./commands/openPortal.ts";
import HandlePaddleWebhook from "./commands/handlePaddleWebhook.ts";
import GetBilling from "./query/getBilling.ts";

export class Commands {
    createCheckout: CreateCheckout
    changePlan: ChangePlan
    openPortal: OpenPortal
    handlePaddleWebhook: HandlePaddleWebhook

    constructor(adapters: Adapters) {
        const {paymentGateway, subscriptionRepository} = adapters
        const prices = adapters.parameters.appSecrets.paddleCredentials.prices
        this.createCheckout = new CreateCheckout(paymentGateway, subscriptionRepository, prices)
        this.changePlan = new ChangePlan(paymentGateway, subscriptionRepository, prices)
        this.openPortal = new OpenPortal(paymentGateway, subscriptionRepository)
        this.handlePaddleWebhook = new HandlePaddleWebhook(paymentGateway, subscriptionRepository, prices)
    }
}

export class Queries {
    getBilling: GetBilling

    constructor(adapters: Adapters) {
        this.getBilling = new GetBilling(adapters.subscriptionRepository)
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
