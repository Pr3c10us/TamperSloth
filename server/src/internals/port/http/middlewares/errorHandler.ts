import type {ErrorRequestHandler, NextFunction, Request, Response} from "express";
import {ZodError} from "zod";
import {StatusCodes} from "http-status-codes";
import {JsonWebTokenError} from "jsonwebtoken";
import {ErrorResponse} from "../../../../packages/responses/error.ts";
import {ApiError} from "../../../../packages/errors";
import {SQL} from "bun";
import {MulterError} from "multer";
import fs from "node:fs";
import {SuccessResponse} from "../../../../packages/responses/success.ts";

const ErrorHandlerMiddleware: ErrorRequestHandler = async (
    err: any,
    req: Request,
    res: Response,
    next: NextFunction
) => {
    console.log(err);
    if (req.file) {
        fs.unlink(req.file.path, () => {
        });
    }
    if (err instanceof ApiError) {
        return new ErrorResponse(res, err.message, err.statusCode, undefined, err.code).send();
    }

    if (err instanceof ZodError) {
        const errorMessages = err.issues.map((issue: any) => ({
            message: `${issue.path.join(".")} is ${issue.message}`,
        }));
        return new ErrorResponse(res, "Invalid data", StatusCodes.BAD_REQUEST, {
            details: errorMessages,
        }).send();
    }

    if (err instanceof JsonWebTokenError) {
        // Customize the message based on the specific error type
        if (err.name === 'TokenExpiredError') {
            return new ErrorResponse(res, "Token has expired", StatusCodes.BAD_REQUEST).send();
        }
        return new ErrorResponse(res, "Invalid token", StatusCodes.BAD_REQUEST).send();

    }
    if (err instanceof SQL.PostgresError) {
        switch (err.errno) {
            case '23505':
                return new ErrorResponse(res, err.detail, StatusCodes.CONFLICT).send();

            case '23503':
                return new ErrorResponse(res, "entity doesn't exist", StatusCodes.NOT_FOUND).send();

            case '23502':
            case '23514':
                return new ErrorResponse(res, err.detail, StatusCodes.BAD_REQUEST).send();

            case '08000':
            case '08003':
            case '08006':
                return new ErrorResponse(res, err.detail, StatusCodes.SERVICE_UNAVAILABLE).send();

            case '53300':
                return new ErrorResponse(res, err.detail, StatusCodes.SERVICE_UNAVAILABLE).send();

            default:
                return new ErrorResponse(res, err.detail, StatusCodes.INTERNAL_SERVER_ERROR).send();
        }
    }
    if (err instanceof MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return new ErrorResponse(res,"File size too large", StatusCodes.INTERNAL_SERVER_ERROR).send()
        }
        if (err.code === 'LIMIT_FILE_COUNT') {
            return new ErrorResponse(res,"Too many files", StatusCodes.INTERNAL_SERVER_ERROR).send()
        }
        if (err.code === 'LIMIT_UNEXPECTED_FILE') {
            return new ErrorResponse(res,"Unexpected field name", StatusCodes.INTERNAL_SERVER_ERROR).send()
        }
    }
    if (err && err.name === 'INVALID_FILE_TYPE') {
        return res.status(400).json({
            error: err.message
        });
    }

    return new ErrorResponse(res).send();
};

export default ErrorHandlerMiddleware;