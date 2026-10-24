import type {Response} from "express";

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
