import {StatusCodes} from "http-status-codes";

/**
 * Base for errors whose message was written for a user to read, so it can be
 * sent to the client as-is. Anything that isn't a SafeError carries a message
 * from a library or a provider SDK and has to be replaced before it leaves the
 * server — see toClientError.
 */
export class SafeError extends Error {
}

export class ApiError extends SafeError {
    statusCode: number;
    code?: string;

    constructor(message: string) {
        super(message);
        this.statusCode = StatusCodes.INTERNAL_SERVER_ERROR;
    }
}

export class NotFoundError extends ApiError {
    constructor(message: string) {
        super(message);
        this.statusCode = StatusCodes.NOT_FOUND;
    }
}

export class BadRequestError extends ApiError {
    constructor(message: string) {
        super(message);
        this.statusCode = StatusCodes.BAD_REQUEST;
    }
}

export class UnAuthorizedError extends ApiError {
    constructor(message: string) {
        super(message);
        this.statusCode = StatusCodes.UNAUTHORIZED;
    }
}

export class ForbiddenError extends ApiError {
    constructor(message: string) {
        super(message);
        this.statusCode = StatusCodes.FORBIDDEN;
    }
}

export class AIRateLimitError extends ApiError {
    constructor(message: string) {
        super(message);
        this.statusCode = StatusCodes.FORBIDDEN;
        this.code = "AI_RATE_LIMIT";
    }
}

export class DuplicateError extends SafeError {
    constructor(message: string) {
        super(message);
    }
}

export class NothingToSegmentError extends SafeError {
    constructor() {
        super("nothing to segment");
    }
}

export class InvalidSegmentsError extends SafeError {
    constructor() {
        super("invalid segment");
    }
}

export class InvalidMilestonesError extends SafeError {
    constructor() {
        super("invalid milestone generated");
    }
}

export class InvalidMilestonesReferenceError extends SafeError {
    constructor() {
        super("invalid milestone references generated");
    }
}

export class InvalidChallengesError extends SafeError {
    constructor() {
        super("invalid challenge generated");
    }
}

export class InvalidAssessmentsError extends SafeError {
    constructor() {
        super("failed to generate feedback, try again");
    }
}

export type ClientError = {
    error: string;
    code?: string;
};

const FALLBACK_MESSAGE = "Something went wrong on our end, try again";

/**
 * SSE streams are past the point where the express error handler can help, so
 * each stream has to shape its own error payload. Provider SDKs put their raw
 * JSON response body in `error.message` — sending that straight through is how
 * a `PERMISSION_DENIED` blob ends up in a toast — so only our own messages are
 * forwarded and everything else is logged here and replaced.
 */
export function toClientError(error: unknown, route?: string): ClientError {
    if (error instanceof SafeError) {
        const code = error instanceof ApiError ? error.code : undefined;
        return {error: error.message, ...(code && {code})};
    }

    console.error(`unhandled error in ${route ?? "stream"}:`, error);
    return {error: FALLBACK_MESSAGE};
}

