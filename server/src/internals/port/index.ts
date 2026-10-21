import ExpressHTTP from "./http";
import AppSecrets from "../../packages/secret";
import Services from "../services";
import type Adapters from "../adapters";

export default class Ports {
    httpPort: ExpressHTTP

    constructor(applicationSecret: AppSecrets, services: Services, adapters: Adapters) {
        this.httpPort = new ExpressHTTP(applicationSecret, services,adapters)
    }
}