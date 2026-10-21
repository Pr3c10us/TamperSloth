import type {NextFunction, Request, Response} from "express";
import type {ZodTypeAny} from "zod";

type RequestData = "body" | "query" | "params" | "headers" | "url";

const ValidationMiddleware = (
    schema: ZodTypeAny,
    reqData: RequestData
) => {
    return (req: Request, res: Response, next: NextFunction) => {
        try {
            const parsed = schema.parse(req[reqData]);
            Object.defineProperty(req, reqData, {
                value: parsed,
                writable: true,
                enumerable: true,
                configurable: true
            });
            next();
        } catch (error) {
            next(error);
        }
    };
};

export default ValidationMiddleware;