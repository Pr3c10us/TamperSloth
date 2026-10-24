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
const ConfirmBody = PlanBody.extend({confirmToken: z.string().min(1)})

export default class BillingHandler {
    router = Router()

    constructor(private billingService: BillingService, authenticationService: AuthenticationService) {
        const authorize = Authorize(authenticationService)
        const authorizeBilling = AuthorizeBilling(authenticationService)
        this.router.get("/plans", this.plans)
        this.router.post("/billing/token", authorize, this.token)
        this.router.get("/billing", authorizeBilling, this.billing)
        this.router.post("/billing/checkout", authorizeBilling, this.checkout)
        this.router.post("/billing/change-plan/preview", authorizeBilling, this.previewChange)
        this.router.post("/billing/change-plan", authorizeBilling, this.changePlan)
        this.router.post("/billing/resume", authorizeBilling, this.resume)
        this.router.post("/billing/portal", authorizeBilling, this.portal)
    }

    /** Public: the pricing page's cards. */
    plans = async (req: Request, res: Response) => {
        new SuccessResponse(res, this.billingService.queries.getPlans.handle()).send()
    }

    /** The extension hands this to the pricing page, since the website has no sign-in of its own. */
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

    /** What a switch would cost and when it applies, with the token that confirms it. */
    previewChange = async (req: Request, res: Response) => {
        const {plan} = PlanBody.parse(req.body)
        const preview = await this.billingService.commands.changePlan.preview(req.user as User, plan)
        new SuccessResponse(res, preview).send()
    }

    changePlan = async (req: Request, res: Response) => {
        const {plan, confirmToken} = ConfirmBody.parse(req.body)
        await this.billingService.commands.changePlan.confirm(req.user as User, plan, confirmToken)
        new SuccessResponse(res, {ok: true}).send()
    }

    resume = async (req: Request, res: Response) => {
        await this.billingService.commands.resumePlan.handle(req.user as User)
        new SuccessResponse(res, {ok: true}).send()
    }

    portal = async (req: Request, res: Response) => {
        const portal = await this.billingService.commands.openPortal.handle(req.user as User)
        new SuccessResponse(res, portal).send()
    }
}
