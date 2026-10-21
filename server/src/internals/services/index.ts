import AuthenticationService from "./authentication";
import Adapters from "../adapters";

export default class Services {
    authenticationService: AuthenticationService

    constructor(adapters: Adapters) {
        this.authenticationService = new AuthenticationService(adapters.userRepository, adapters.parameters.appSecrets)
    }
}