import type AuthenticationService from "../../../services/authentication";
import {type Request, type Response, Router} from "express";
import {BadRequestError} from "../../../../packages/errors";
import {generateJWTToken, generateRefreshJWTToken, verifyRefreshToken} from "../../../../packages/utils/encryption.ts";
import type Payload from "../../../../packages/types/payload";
import {SuccessResponse} from "../../../../packages/responses/success.ts";
import type {User} from "../../../domain/user";

export default class AuthenticationHandler {
    authenticationService: AuthenticationService
    router = Router()

    constructor(authenticationService: AuthenticationService) {
        this.authenticationService = authenticationService
        this.router.post('/extension/google', this.extensionLogin);
        this.router.post('/extension/token', this.extensionRefresh);
    }

    private sendSession(res: Response, user: User) {
        const payload: Payload = {id: user.id};
        new SuccessResponse(res, {
            token: generateJWTToken(payload),
            refreshToken: generateRefreshJWTToken(payload),
        }).send();
    }

    extensionLogin = async (req: Request, res: Response) => {
        const accessToken = req.body?.accessToken;
        if (typeof accessToken !== "string" || !accessToken) throw new BadRequestError("accessToken is required");
        const user = await this.authenticationService.commands.authenticateGoogleToken.handle(accessToken);
        this.sendSession(res, user);
    };

    extensionRefresh = async (req: Request, res: Response) => {
        const refreshToken = req.body?.refreshToken;
        if (typeof refreshToken !== "string" || !refreshToken) throw new BadRequestError("refreshToken is required");
        const payload = verifyRefreshToken(refreshToken) as Payload;
        const user = await this.authenticationService.queries.getDetails.handle({id: payload.id});
        this.sendSession(res, user);
    };
}
