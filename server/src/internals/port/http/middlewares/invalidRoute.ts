import type { Request, Response } from "express";
import {NotFoundError} from "../../../../packages/errors";

const Route404 = (req: Request, res: Response) => {
    throw new NotFoundError("404 ROUTE!!!");
};

export default Route404;