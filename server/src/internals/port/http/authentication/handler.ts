import passport from 'passport';
import {Strategy as GoogleStrategy} from 'passport-google-oauth20';
import type AuthenticationService from "../../../services/authentication";
import {type NextFunction, type Request, type Response, Router} from "express";
import {ForbiddenError} from "../../../../packages/errors";
import {generateJWTToken, generateRefreshJWTToken} from "../../../../packages/utils/encryption.ts";
import type Payload from "../../../../packages/types/payload";
import {SuccessResponse, SuccessResponseWithCookies} from "../../../../packages/responses/success.ts";
import type Cookie from "../../../../packages/types/cookies";
import type {User} from "../../../domain/user";
import {AuthorizeRefreshToken} from "../middlewares/authorization.ts";
import type AppSecrets from "../../../../packages/secret";
import {SQL} from "bun";

export default class AuthenticationHandler {
    authenticationService: AuthenticationService
    appSecret: AppSecrets
    router = Router()
    googleStrategy: GoogleStrategy

    constructor(authenticationService: AuthenticationService, appSecret: AppSecrets) {
        this.authenticationService = authenticationService
        this.appSecret = appSecret
        this.googleStrategy = new GoogleStrategy({
            clientID: this.appSecret.googleOAuthCredentials.id,
            clientSecret: this.appSecret.googleOAuthCredentials.secret,
            callbackURL: this.appSecret.googleOAuthCredentials.callbackUrl
        }, async (accessToken, refreshToken, profile, done) => {
            try {
                const user = await this.authenticationService.commands.authenticate.handle(profile.emails?.[0]?.value!, profile.id)
                return done(null, user);
            } catch (error) {
                console.log({error})
                return done(error, undefined);
            }
        })

        this.configureRoutes()
    }

    private configureRoutes() {
        passport.use(this.googleStrategy)

        this.router.get('/google',
            passport.authenticate('google', {scope: ['profile', 'email']})
        );

        this.router.get('/google/callback',
            passport.authenticate('google', {
                session: false,
                failureRedirect: `${this.appSecret.urls.uiLogin}?auth_failed`
            }),
            this.oauthCallback,
            (error: any, req: Request, res: Response, next: NextFunction) => {
                if (error instanceof SQL.PostgresError) {
                    switch (error.errno) {
                        case '23505':
                            new SuccessResponse(res, {message: "logged out"}).redirect(`${this.appSecret.urls.uiLogin}?error="wrong authentication method"`)
                    }
                }
                throw error
            }
        )

        this.router.get(
            '/token/refresh',
            AuthorizeRefreshToken(this.authenticationService),
            this.generateNewToken
        );

        this.router.get(
            '/logout',
            this.logout
        );
    }

    oauthCallback = async (req: Request, res: Response) => {
        let user = req.user as User;
        user = await this.authenticationService.queries.getDetails.handle({id: user.id})
        if (!user) {
            new SuccessResponse(res, {message: "logged out"}).redirect(`${this.appSecret.urls.uiLogin}?error="issue authenticating user"`)
        }
        const payload: Payload = {id: user.id};
        const token = generateJWTToken(payload);
        const refreshToken = generateRefreshJWTToken(payload);
        new SuccessResponse(res, {
            jwt: token,
            refreshToken,
            user
        }).redirect(this.appSecret.urls.uiDashboard);
    };

    generateNewToken = async (req: Request, res: Response) => {
        let user = req.user as User;
        if (!user) {
            throw new ForbiddenError("login again")
        }
        const payload: Payload = {id: user.id};
        const token = generateJWTToken(payload);
        const cookie: Cookie[] = [
            {
                key: "token",
                value: token,
            }
        ];
        new SuccessResponseWithCookies(res, cookie, {jwt: token, user}).send();
    }

    logout = async (req: Request, res: Response) => {
        res.clearCookie("token")
        res.clearCookie("refreshToken")
        new SuccessResponse(res, {message: "logged out"}).redirect(this.appSecret.urls.uiLogin)
    }
}