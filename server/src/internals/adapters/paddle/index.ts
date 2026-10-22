import {ApiError, Environment, Paddle, type SubscriptionNotification} from "@paddle/paddle-node-sdk";
import type {PaymentEvent, PaymentGateway, SubscriptionSnapshot} from "../../domain/billing";
import type {PaddleCredentials} from "../../../packages/secret";
import {BadRequestError, ServiceUnavailableError} from "../../../packages/errors";

export default class PaddleGateway implements PaymentGateway {
    configured: boolean
    private client?: Paddle

    constructor(private credentials: PaddleCredentials) {
        this.configured = Boolean(credentials.apiKey && credentials.webhookSecret)
        if (credentials.apiKey) {
            this.client = new Paddle(credentials.apiKey, {
                environment: credentials.environment === "production" ? Environment.production : Environment.sandbox,
            })
        }
    }

    async resolveCustomer(email: string): Promise<string> {
        const paddle = this.paddle()
        try {
            const customer = await paddle.customers.create({email})
            return customer.id
        } catch (error) {
            if (!(error instanceof ApiError) || error.code !== "customer_already_exists") throw this.clientError(error)
        }
        // Someone with this email checked out before the customer id was saved, or bought outside the extension.
        const customers = await paddle.customers.list({email: [email]}).next().catch(error => {
            throw this.clientError(error)
        })
        const match = customers.find(customer => customer.email.toLowerCase() === email.toLowerCase())
        if (!match) throw new ServiceUnavailableError("Billing is unavailable right now, try again")
        return match.id
    }

    async createTransaction(params: { priceId: string, customerId: string, userId: string }): Promise<string> {
        try {
            const transaction = await this.paddle().transactions.create({
                items: [{priceId: params.priceId, quantity: 1}],
                customerId: params.customerId,
                customData: {userId: params.userId},
            })
            return transaction.id
        } catch (error) {
            throw this.clientError(error)
        }
    }

    async changeSubscriptionPrice(paddleSubscriptionId: string, priceId: string, keepActive: boolean): Promise<void> {
        try {
            // Paddle won't drop a scheduled change in the same update as other fields, so it goes first.
            if (keepActive) await this.paddle().subscriptions.update(paddleSubscriptionId, {scheduledChange: null})
            await this.paddle().subscriptions.update(paddleSubscriptionId, {
                items: [{priceId, quantity: 1}],
                prorationBillingMode: "prorated_immediately",
                // A declined upgrade charge leaves the plan as it was instead of putting it past due.
                onPaymentFailure: "prevent_change",
            })
        } catch (error) {
            throw this.clientError(error)
        }
    }

    async portalUrl(paddleCustomerId: string, paddleSubscriptionIds: string[]): Promise<string> {
        try {
            const session = await this.paddle().customerPortalSessions.create(paddleCustomerId, paddleSubscriptionIds)
            return session.urls.general.overview
        } catch (error) {
            throw this.clientError(error)
        }
    }

    async verifyWebhook(rawBody: string, signature: string): Promise<PaymentEvent> {
        if (!this.configured) throw new ServiceUnavailableError("Billing isn't set up")
        let event
        try {
            // Checks the HMAC and that the signature is at most a few seconds old, which stops replays.
            event = await this.paddle().webhooks.unmarshal(rawBody, this.credentials.webhookSecret, signature)
        } catch {
            throw new BadRequestError("invalid signature")
        }
        return {
            eventId: event.eventId,
            type: event.eventType,
            occurredAt: new Date(event.occurredAt),
            rawBody,
            ...(event.eventType.startsWith("subscription.") && {
                subscription: snapshot(event.data as SubscriptionNotification),
            }),
        }
    }

    private paddle(): Paddle {
        if (!this.configured || !this.client) throw new ServiceUnavailableError("Billing isn't set up")
        return this.client
    }

    /** Paddle's messages are for us, not the user: log them and answer with our own. */
    private clientError(error: unknown): Error {
        if (error instanceof ApiError) {
            console.error(`paddle answered ${error.code}: ${error.detail}`)
            const clientError = new ServiceUnavailableError("Billing is unavailable right now, try again")
            clientError.code = "BILLING_UNAVAILABLE"
            return clientError
        }
        return error instanceof Error ? error : new Error(String(error))
    }
}

function snapshot(subscription: SubscriptionNotification): SubscriptionSnapshot {
    const item = subscription.items.find(item => item.recurring) ?? subscription.items[0]
    const userId = subscription.customData?.userId
    const period = subscription.currentBillingPeriod
    return {
        paddleSubscriptionId: subscription.id,
        paddleCustomerId: subscription.customerId,
        paddlePriceId: item?.price?.id ?? "",
        userId: typeof userId === "string" ? userId : null,
        status: subscription.status,
        currentPeriodStart: period ? new Date(period.startsAt) : null,
        currentPeriodEnd: period ? new Date(period.endsAt) : null,
        cancelAtPeriodEnd: subscription.scheduledChange?.action === "cancel",
        canceledAt: subscription.canceledAt ? new Date(subscription.canceledAt) : null,
    }
}
