import type {NextFunction, Request, Response} from "express";
import {BadRequestError, UnAuthorizedError} from "../../../../packages/errors";
import {verifyEmailToken, verifyRefreshToken, verifyToken} from "../../../../packages/utils/encryption";
import type Payload from "../../../../packages/types/payload";
import AccountServices from "../../../services/authentication";
import {IncomingMessage} from "http";
import {z} from "zod";

export const Authorize = (services: AccountServices) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        let token: any = req.headers.authorization?.split(" ")[1];
        if (!token) {
            token = req.signedCookies.token;
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

export const AuthorizeEmailToken = (services: AccountServices) => {
        return async (req: Request, res: Response, next: NextFunction) => {
            let token: any = req.headers.authorization?.split(" ")[1];

            if (!token) {
                token = req.query.token;
            }
            if (!token) throw new UnAuthorizedError("token has expired");

            try {
                const jwtPayload = verifyEmailToken(token);
                const payload: Payload = jwtPayload as Payload;

                req.user = await services.queries.getDetails.handle({id: payload.id});
                next();
            } catch (error) {
                throw new UnAuthorizedError("token has expired");
                throw error;
            }
        };
    }
;

export const AuthorizeRefreshToken = (services: AccountServices) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        let refreshToken: any = req.headers.authorization?.split(" ")[1];
        if (!refreshToken) {
            refreshToken = req.signedCookies.refreshToken;
        }
        if (!refreshToken) {
            refreshToken = req.query.refreshToken;
        }
        if (!refreshToken) throw new UnAuthorizedError("session has expired");

        try {
            // Refresh tokens are signed with refreshJWTSecret, not jwtSecret.
            const jwtPayload = verifyRefreshToken(refreshToken);
            const payload: Payload = jwtPayload as Payload;

            req.user = await services.queries.getDetails.handle({id: payload.id});
            next();
        } catch (error) {
            throw error;
        }
    };
};