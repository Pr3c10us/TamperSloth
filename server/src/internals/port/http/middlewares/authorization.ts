import type {NextFunction, Request, Response} from "express";
import {BadRequestError, UnAuthorizedError} from "../../../../packages/errors";
import {verifyEmailToken, verifyToken} from "../../../../packages/utils/encryption";
import type Payload from "../../../../packages/types/payload";
import AccountServices from "../../../services/authentication";
import {IncomingMessage} from "http";
import {z} from "zod";

export const Authorize = (services: AccountServices) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        let token: any = req.headers.authorization?.split(" ")[1];
        if (!token) {
            token = req.signedCookies?.token;
        }
        if (!token) {
            token = req.query.token;
        }
        if (!token) throw new UnAuthorizedError("session has expired");

        try {
            const jwtPayload = verifyToken(token);
            const payload: Payload = jwtPayload as Payload;

            req.user = await services.queries.getDetails.handle({id: payload.id});
            next();
        } catch (error) {
            throw error;
        }
    };
};