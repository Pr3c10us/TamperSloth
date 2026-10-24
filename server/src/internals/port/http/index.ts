import express, {type Express} from "express";
import AppSecrets from "../../../packages/secret";
import {StatusCodes} from "http-status-codes";
import helmet from "helmet";
import cors from 'cors'
import MorganMiddleware from "./middlewares/morgan.ts";
import ErrorHandlerMiddleware from "./middlewares/errorHandler.ts";
import Route404 from "./middlewares/invalidRoute.ts";
import type Services from "../../services";
import http from "http";
import type Adapters from "../../adapters";
import {rateLimit} from 'express-rate-limit';
import AuthenticationHandler from "./authentication/handler.ts";
import InferenceHandler from "./inference/handler.ts";
import BillingHandler from "./billing/handler.ts";
import WebhookHandler from "./webhook/handler.ts";

// Agent requests carry screenshots and long tool histories.
const MODEL_REQUEST_BODY_LIMIT = "32mb"

export default class ExpressHTTP {
    appSecrets: AppSecrets
    services: Services
    adapters: Adapters
    server: Express;
    bareServer: http.Server

    router = express.Router();

    constructor(appSecrets: AppSecrets, services: Services, adapters: Adapters) {
        this.appSecrets = appSecrets
        this.services = services
        this.adapters = adapters
        this.server = express();
        this.bareServer = http.createServer(this.server)

        // Middlewares
        this.server.set('trust proxy', 1)
        // First, so requests answered before the rest of the stack (the Paddle webhook) are logged too.
        let morganMiddleware = new MorganMiddleware()
        this.server.use(morganMiddleware.middleware)
        // Ahead of the JSON parser and the rate limiter: the signature covers the raw body, and Paddle retries in bursts.
        this.webhooks()
        this.server.use("/api/v1/models", express.json({limit: MODEL_REQUEST_BODY_LIMIT}));
        this.server.use(express.json());
        this.server.use(express.urlencoded({extended: true}));
        this.server.use(helmet())
        this.server.use(rateLimit({
            windowMs: 60 * 1000,
            max: 100,
            standardHeaders: true,
            legacyHeaders: false,
            message: {error: 'Too many requests, please try again later.'}
        }))
        const corsOptions = {
            origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
                if (!origin || this.appSecrets.clientOrigins.includes(origin) || this.isAllowedExtensionOrigin(origin)) {
                    callback(null, true);
                } else {
                    callback(new Error(`Origin "${origin}" is not allowed by CORS`));
                }
            },
            credentials: true,
            methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
            allowedHeaders: [
                'Content-Type',
                'Authorization',
                'X-Requested-With',
                'ngrok-skip-browser-warning',
                'X-Sloth-Run',
            ],
            exposedHeaders: ['Retry-After'],
        };
        this.server.use(cors(corsOptions));


        this.health()
        this.authentication()
        this.inference()
        this.billing()

        this.server.use(`/api/v1`, this.router);

        this.server.use(Route404);
        this.server.use(ErrorHandlerMiddleware);
    }

    listen() {
        this.bareServer.listen(this.appSecrets.port, () => {
            console.log(`Listening on port http://localhost:${this.appSecrets.port}...`);
        })
    }

    authentication = () => {
        const router = new AuthenticationHandler(this.services.authenticationService);
        this.server.use("/auth", router.router);
    };

    inference = () => {
        const handler = new InferenceHandler(this.services.inferenceService, this.services.authenticationService);
        this.router.use(handler.router);
    };

    billing = () => {
        const handler = new BillingHandler(this.services.billingService, this.services.authenticationService);
        this.router.use(handler.router);
    };

    webhooks = () => {
        const handler = new WebhookHandler(this.services.billingService);
        this.server.use("/webhooks", handler.router);
    };

    /** chrome-extension://<id>, for the IDs in EXTENSION_IDS (any ID when it is empty). */
    isAllowedExtensionOrigin(origin: string): boolean {
        const match = /^chrome-extension:\/\/([a-p]{32})$/.exec(origin);
        if (!match) return false;
        return this.appSecrets.extensionIds.length === 0 || this.appSecrets.extensionIds.includes(match[1]!);
    }

    health() {
        this.server.get('/health', async (req, res) => {
            return res.status(StatusCodes.OK).send("server up")
        })
    }
}