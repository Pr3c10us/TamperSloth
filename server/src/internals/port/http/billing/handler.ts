import {type Request, type Response, Router} from "express";
import {z} from "zod";
import type BillingService from "../../../services/billing";
import type AuthenticationService from "../../../services/authentication";
import {Authorize, AuthorizeBilling} from "../middlewares/authorization.ts";
import {SuccessResponse} from "../../../../packages/responses/success.ts";
import {generateBillingToken} from "../../../../packages/utils/encryption.ts";
import type Payload from "../../../../packages/types/payload";
import type {User} from "../../../domain/user";

const PlanBody = z.object({plan: z.enum(["go", "pro"])})

export default class BillingHandler {
    router = Router()

    constructor(private billingService: BillingService, authenticationService: AuthenticationService) {
        const authorize = Authorize(authenticationService)
        const authorizeBilling = AuthorizeBilling(authenticationService)
        this.router.post("/billing/token", authorize, this.token)
        this.router.get("/billing", authorizeBilling, this.billing)
        this.router.post("/billing/checkout", authorizeBilling, this.checkout)
        this.router.post("/billing/change-plan", authorizeBilling, this.changePlan)
        this.router.post("/billing/portal", authorizeBilling, this.portal)
    }

    /** The extension opens the pricing page with this, since the website has no sign-in of its own. */
    token = async (req: Request, res: Response) => {
        const payload: Payload = {id: (req.user as User).id}
        new SuccessResponse(res, {token: generateBillingToken(payload)}).send()
    }

    billing = async (req: Request, res: Response) => {
        const billing = await this.billingService.queries.getBilling.handle(req.user as User)
        new SuccessResponse(res, billing).send()
    }

    checkout = async (req: Request, res: Response) => {
        const {plan} = PlanBody.parse(req.body)
        const checkout = await this.billingService.commands.createCheckout.handle(req.user as User, plan)
        new SuccessResponse(res, checkout).send()
    }

    changePlan = async (req: Request, res: Response) => {
        const {plan} = PlanBody.parse(req.body)
        await this.billingService.commands.changePlan.handle(req.user as User, plan)
        new SuccessResponse(res, {ok: true}).send()
    }

    portal = async (req: Request, res: Response) => {
        const portal = await this.billingService.commands.openPortal.handle(req.user as User)
        new SuccessResponse(res, portal).send()
    }
}
