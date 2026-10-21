import morgan from "morgan";
import chalk from "chalk";
import type {Handler, Request, Response} from "express";

export default class Middleware {
    middleware: Handler

    constructor() {
        morgan.token('status-colored', (req: Request, res: Response) => {
            const status = res.statusCode;
            let color;
            if (status >= 500) {
                color = chalk.red;
            } else if (status >= 400) {
                color = chalk.yellow;
            } else if (status >= 300) {
                color = chalk.cyan;
            } else {
                color = chalk.green;
            }

            return color(status);
        });

        const morganFormat = ':method :url :status-colored :response-time ms';

        this.middleware = morgan(morganFormat);
    }
}