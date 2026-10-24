import ExpressHTTP from "./http";
import AppSecrets from "../../packages/secret";
import Services from "../services";
import type Adapters from "../adapters";
import Jobs from "./jobs";

export default class Ports {
    httpPort: ExpressHTTP
    jobs: Jobs

    constructor(applicationSecret: AppSecrets, services: Services, adapters: Adapters) {
        this.httpPort = new ExpressHTTP(applicationSecret, services,adapters)
        this.jobs = new Jobs(services, adapters.parameters.redisClient)
    }
}