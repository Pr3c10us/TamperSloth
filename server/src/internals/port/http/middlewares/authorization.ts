import type {NextFunction, Request, Response} from "express";
import {UnAuthorizedError} from "../../../../packages/errors";
import {isBillingToken, verifyBillingToken, verifyToken} from "../../../../packages/utils/encryption";
import type Payload from "../../../../packages/types/payload";
import AccountServices from "../../../services/authentication";

export const Authorize = (services: AccountServices) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        let token: any = req.headers.authorization?.split(" ")[1];
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

/**
 * For the billing routes: accepts the pricing page's billing token as well as
 * the extension's own session token.
 */
export const AuthorizeBilling = (services: AccountServices) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        const token = req.headers.authorization?.split(" ")[1];
        if (!token) throw new UnAuthorizedError("session has expired");

        const payload = (isBillingToken(token) ? verifyBillingToken(token) : verifyToken(token)) as Payload;
        req.user = await services.queries.getDetails.handle({id: payload.id});
        next();
    };
};
