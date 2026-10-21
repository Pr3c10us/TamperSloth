import {type Request, type Response, Router} from "express";
import {once} from "node:events";
import type InferenceService from "../../../services/inference";
import type AuthenticationService from "../../../services/authentication";
import {Authorize} from "../middlewares/authorization.ts";
import {SuccessResponse} from "../../../../packages/responses/success.ts";
import {encodeStreamPart} from "../../../../packages/utils/modelWire.ts";
import {toClientError} from "../../../../packages/errors";
import type {User} from "../../../domain/user";

export default class InferenceHandler {
    router = Router()

        constructor(private inferenceService: InferenceService, authenticationService: AuthenticationService) {
        const authorize = Authorize(authenticationService)
        this.router.get("/account", authorize, this.account)
        this.router.post("/models/:modelId/stream", authorize, this.stream)
    }

    account = async (req: Request, res: Response) => {
        const account = await this.inferenceService.queries.getAccount.handle(req.user as User)
        new SuccessResponse(res, account).send()
    }

    stream = async (req: Request, res: Response) => {
        const abort = new AbortController()
        res.on("close", () => {
            if (!res.writableFinished) abort.abort()
        })

        const {model, stream} = await this.inferenceService.commands.streamModel.handle(
            req.user as User, String(req.params.modelId), req.body, abort.signal,
        )

        res.status(200)
        res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8")
        res.setHeader("Cache-Control", "no-cache, no-transform")
        res.setHeader("X-Accel-Buffering", "no")
        res.flushHeaders()

        const reader = stream.getReader()
        try {
            while (true) {
                const {done, value} = await reader.read()
                if (done) break
                const line = encodeStreamPart(value, model.id)
                if (line && !res.write(line)) await once(res, "drain", {signal: abort.signal})
            }
        } catch (error) {
            if (!abort.signal.aborted) {
                res.write(JSON.stringify({type: "error", error: toClientError(error, req.originalUrl)}) + "\n")
            }
        } finally {
            reader.releaseLock()
            if (!res.writableEnded) res.end()
        }
    }
}
