import express, {type Express} from "express";
import AppSecrets from "../../../packages/secret";
import {StatusCodes} from "http-status-codes";
import helmet from "helmet";
import cors from 'cors'
import MorganMiddleware from "./middlewares/morgan.ts";
import ErrorHandlerMiddleware from "./middlewares/errorHandler.ts";
import Route404 from "./middlewares/invalidRoute.ts";
import passport from "passport";
import type Services from "../../services";
import http from "http";
import {WebSocketServer} from "ws";
import type Adapters from "../../adapters";
import {rateLimit} from 'express-rate-limit';
import AuthenticationHandler from "./authentication/handler.ts";

export default class ExpressHTTP {
    appSecrets: AppSecrets
    services: Services
    adapters: Adapters
    server: Express;
    bareServer: http.Server
    websocketServer: WebSocketServer

    router = express.Router();

    constructor(appSecrets: AppSecrets, services: Services, adapters: Adapters) {
        this.appSecrets = appSecrets
        this.services = services
        this.adapters = adapters
        this.server = express();
        this.bareServer = http.createServer(this.server)
        this.websocketServer = new WebSocketServer({server: this.bareServer})  // Single server

        // Middlewares
        this.server.set('trust proxy', 1)
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
                if (!origin || this.appSecrets.clientOrigins.includes(origin)) {
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
                'ngrok-skip-browser-warning'
            ],
        };
        this.server.use(cors(corsOptions));
        let morganMiddleware = new MorganMiddleware()
        this.server.use(morganMiddleware.middleware)

        // Passport
        this.server.use(passport.initialize());

        this.health()
        this.authentication()

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
        const router = new AuthenticationHandler(this.services.authenticationService, this.appSecrets);
        this.server.use("/auth", router.router);
    };

    health() {
        this.server.get('/health', async (req, res) => {
            return res.status(StatusCodes.OK).send("server up")
        })
    }
}