import type {Response} from "express";
import {StatusCodes} from "http-status-codes";
import type Cookie from "../types/cookies";
import AppSecrets from "../secret";

type Success = {
    statusCode: number;
    message: string;
    data?: any;
    metadata?: any;
};

export class SuccessResponse {
    success: Success;
    response: Response;

    constructor(res: Response, data?: any, metadata?: any) {
        this.response = res;
        this.success = {
            statusCode: res.statusCode,
            message: "success",
        };

        if (data !== null && data !== undefined) {
            this.success.data = data;
        }

        if (metadata !== null && metadata !== undefined) {
            this.success.metadata = metadata;
        }
    }

    send = () => {
        this.response.status(this.success.statusCode).json(this.success);
    };
    redirect = (url: string) => {
        this.response.redirect(url);
    };
}

export class SuccessResponseWithHTML {
    html: string;
    response: Response;

    constructor(res: Response, html: string) {
        this.response = res;
        this.html = html
    }

    send = () => {
        this.response.status(StatusCodes.OK).send(this.html);
    };
}

export class SuccessResponseWithCookies {
    success: Success;
    response: Response;
    cookie: Cookie[];
    appSecret: AppSecrets

    constructor(res: Response, cookie: Cookie[], data?: any, metadata?: any) {
        this.response = res;
        this.cookie = cookie;
        this.success = {
            statusCode: res.statusCode,
            message: "success",
        };
        this.appSecret = new AppSecrets()
        if (data !== null && data !== undefined) {
            this.success.data = data;
        }

        if (metadata !== null && metadata !== undefined) {
            this.success.metadata = metadata;
        }
    }

    sendCookie = () => {
        for (const cookieElement of this.cookie) {
            this.response
                .cookie(cookieElement.key, cookieElement.value, {
                    signed: true,
                    maxAge: this.appSecret.cookieExpires,
                    httpOnly: true,
                    secure: true, // Required for cross-origin
                    sameSite: 'none', // Required for cross-origin
                    // domain: '.fazerlane.com', // Allows cookie across subdomains
                    path: '/'
                })
        }

    }
    send = () => {
        this.sendCookie()
        this.response.status(this.success.statusCode)
            .json(this.success);
    }


    redirect = (url: string) => {
        this.sendCookie()
        this.response.redirect(url);
    }

    logout = () => {
        this.response.cookie("token", "", {
            signed: true,
            maxAge: 0,
            httpOnly: false,
        }).cookie("refreshToken", "", {
            signed: true,
            maxAge: 0,
            httpOnly: false,
        }).json(this.success)
    }
}


export class FileDownloadResponse {
    constructor(
        private res: Response,
        private fileBuffer: Buffer,
        private fileName: string,
        private mimeType: string = 'application/octet-stream'
    ) {
    }

    send = () => {
        this.res.set({
            'Content-Type': this.mimeType,
            'Content-Disposition': `attachment; filename="${this.fileName}"`,
            'Content-Length': this.fileBuffer.length,
        });
        this.res.status(200).send(this.fileBuffer);
    };
}


