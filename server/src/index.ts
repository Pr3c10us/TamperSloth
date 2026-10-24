import AppSecrets from "./packages/secret";
import Ports from "./internals/port";
import Adapters from "./internals/adapters";
import {
  bunPostgresClientConnection,
  redisClientConnection,
} from "./packages/utils/connections.ts";
import Services from "./internals/services";
import {setPlanCredits} from "./internals/domain/plan";

class TamperSlothBackend {
  adapters: Adapters;
  services: Services;
  port: Ports;

  constructor() {
    const appSecrets = new AppSecrets();
    setPlanCredits(appSecrets.planCredits);
    const postgresClient = bunPostgresClientConnection(
      appSecrets.postgresCredentials
    );
    const redisClient = redisClientConnection(appSecrets.redisCredentials);

    this.adapters = new Adapters({
      appSecrets,
      postgresClient,
      redisClient,
    });

    this.services = new Services(this.adapters);
    this.port = new Ports(appSecrets, this.services, this.adapters);
  }

  run() {
    this.port.httpPort.listen();
    this.port.jobs.start();
  }
}

const tamperSlothBackend = new TamperSlothBackend();
tamperSlothBackend.run();
