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