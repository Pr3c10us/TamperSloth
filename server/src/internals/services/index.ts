import AuthenticationService from "./authentication";
import InferenceService from "./inference";
import Adapters from "../adapters";

export default class Services {
    authenticationService: AuthenticationService
    inferenceService: InferenceService

    constructor(adapters: Adapters) {
        this.authenticationService = new AuthenticationService(adapters.userRepository, adapters.parameters.appSecrets, adapters.googleTokenVerifier)
        this.inferenceService = new InferenceService(adapters)
    }
}
