import AuthenticationService from "./authentication";
import InferenceService from "./inference";
import Adapters from "../adapters";
import BillingService from "./billing";

export default class Services {
    authenticationService: AuthenticationService
    inferenceService: InferenceService
    billingService: BillingService

    constructor(adapters: Adapters) {
        this.authenticationService = new AuthenticationService(adapters.userRepository, adapters.parameters.appSecrets, adapters.googleTokenVerifier, adapters)
        this.inferenceService = new InferenceService(adapters)
        this.billingService = new BillingService(adapters)
    }
}
