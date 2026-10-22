import express, {type Request, type Response, Router} from "express";
import type BillingService from "../../../services/billing";
import {SuccessResponse} from "../../../../packages/responses/success.ts";
import {BadRequestError} from "../../../../packages/errors";

export default class WebhookHandler {
    router = Router()

    constructor(private billingService: BillingService) {
        // express.raw: the signature is over the exact bytes Paddle sent.
        this.router.post("/paddle", express.raw({type: "application/json"}), this.paddle)
    }

    paddle = async (req: Request, res: Response) => {
        const signature = req.get("Paddle-Signature")
        if (!signature || !Buffer.isBuffer(req.body)) throw new BadRequestError("invalid signature")
        await this.billingService.commands.handlePaddleWebhook.handle(req.body.toString("utf8"), signature)
        new SuccessResponse(res).send()
    }
}
