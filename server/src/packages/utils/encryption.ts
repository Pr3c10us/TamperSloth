import * as jwt from "jsonwebtoken";
import AppSecrets from "../secret";
import {ForbiddenError} from "../errors";
import * as bcrypt from "bcryptjs";

export const encrypt = async (password: string): Promise<string> => {
    var salt = bcrypt.genSaltSync(10);
    return await bcrypt.hash(password, salt);
};

export const compareHash = (
    password: string,
    hash: string | undefined
): boolean => {
    if (hash == undefined) {
        return false;
    } else {
        return bcrypt.compareSync(password, hash);
    }
};

export const generateJWTToken = (payload: string | object): string => {
    const environmentVariables = new AppSecrets();
    const options: jwt.SignOptions = {
        expiresIn: environmentVariables.jwtExpires
    };
    return jwt.sign(payload, environmentVariables.jwtSecret, options);
};

export const generateEmailToken = (payload: string | object): string => {
    const environmentVariables = new AppSecrets();
    const options: jwt.SignOptions = {
        expiresIn: environmentVariables.emailJWTExpires
    };
    return jwt.sign(payload, environmentVariables.emailJWTSecret, options);
};

export const generateRefreshJWTToken = (payload: string | object): string => {
    const environmentVariables = new AppSecrets();
    const options: jwt.SignOptions = {
        expiresIn: environmentVariables.refreshJWTExpires
    };
    return jwt.sign(payload, environmentVariables.refreshJWTSecret, options);
};

export const verifyToken = (token: string) => {
    const environmentVariables = new AppSecrets();
    try {
        return jwt.verify(token, environmentVariables.jwtSecret);
    } catch (error) {
        if (error instanceof jwt.TokenExpiredError) {
            throw new ForbiddenError("session has expired");
        } else if (error instanceof jwt.JsonWebTokenError) {
            throw new ForbiddenError("invalid token");
        } else {
            throw error;
        }
    }
};

export const verifyEmailToken = (token: string) => {
    const environmentVariables = new AppSecrets();
    try {
        return jwt.verify(token, environmentVariables.emailJWTSecret);
    } catch (error) {
        if (error instanceof jwt.TokenExpiredError) {
            throw new ForbiddenError("session has expired");
        } else if (error instanceof jwt.JsonWebTokenError) {
            throw new ForbiddenError("invalid token");
        } else {
            throw error;
        }
    }
};

export const verifyRefreshToken = (token: string) => {
    const environmentVariables = new AppSecrets();
    try {
        return jwt.verify(token, environmentVariables.refreshJWTSecret);
    } catch (error) {
        if (error instanceof jwt.TokenExpiredError) {
            throw new ForbiddenError("session has expired");
        } else if (error instanceof jwt.JsonWebTokenError) {
            throw new ForbiddenError("invalid token");
        } else {
            throw error;
        }
    }
};

const BILLING_AUDIENCE = "billing";
// Long enough to read the pricing page and finish checkout.
const BILLING_TOKEN_SECONDS = 30 * 60;

/**
 * A short-lived token the extension hands to the pricing page. It is signed
 * with its own secret, so it can only reach the billing routes.
 */
export const generateBillingToken = (payload: object): string => {
    const environmentVariables = new AppSecrets();
    return jwt.sign(payload, environmentVariables.billingTokenSecret, {
        expiresIn: BILLING_TOKEN_SECONDS,
        audience: BILLING_AUDIENCE,
    });
};

export const isBillingToken = (token: string): boolean => {
    const decoded = jwt.decode(token);
    return typeof decoded === "object" && decoded?.aud === BILLING_AUDIENCE;
};

export const verifyBillingToken = (token: string) => {
    const environmentVariables = new AppSecrets();
    try {
        return jwt.verify(token, environmentVariables.billingTokenSecret, {audience: BILLING_AUDIENCE});
    } catch (error) {
        if (error instanceof jwt.TokenExpiredError) {
            throw new ForbiddenError("session has expired");
        } else if (error instanceof jwt.JsonWebTokenError) {
            throw new ForbiddenError("invalid token");
        } else {
            throw error;
        }
    }
};

const PLAN_CHANGE_AUDIENCE = "plan-change";
const PLAN_CHANGE_TOKEN_SECONDS = 10 * 60;

/**
 * Issued with a plan-change preview and required to make the change, so a change
 * only happens as previewed: the same plan, kind and subscription.
 */
export const generatePlanChangeToken = (payload: object): string => {
    const environmentVariables = new AppSecrets();
    return jwt.sign(payload, environmentVariables.billingTokenSecret, {
        expiresIn: PLAN_CHANGE_TOKEN_SECONDS,
        audience: PLAN_CHANGE_AUDIENCE,
    });
};

/** The previewed change, or null when the token is wrong or expired. */
export const verifyPlanChangeToken = (token: string): Record<string, unknown> | null => {
    const environmentVariables = new AppSecrets();
    try {
        const payload = jwt.verify(token, environmentVariables.billingTokenSecret, {audience: PLAN_CHANGE_AUDIENCE});
        return typeof payload === "object" ? payload as Record<string, unknown> : null;
    } catch {
        return null;
    }
};
