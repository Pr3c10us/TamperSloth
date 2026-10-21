import AppSecrets from "./packages/secret";
import Ports from "./internals/port";
import Adapters from "./internals/adapters";
import {
  bunPostgresClientConnection,
} from "./packages/utils/connections.ts";
import Services from "./internals/services";

class FazerlaneBackend {
  adapters: Adapters;
  services: Services;
  port: Ports;

  constructor() {
    const appSecrets = new AppSecrets();
    const postgresClient = bunPostgresClientConnection(
      appSecrets.postgresCredentials
    );

    this.adapters = new Adapters({
      appSecrets,
      postgresClient,
    });

    this.services = new Services(this.adapters);
    this.port = new Ports(appSecrets, this.services, this.adapters);
  }

  run() {
    this.port.httpPort.listen();
  }
}

const fazerlaneBackend = new FazerlaneBackend();
fazerlaneBackend.run();
