import type Repository from "../../domain/user/repository.ts";
import Authenticate from "./commands/authenticate.ts";
import GetDetails from "./query/getDetails.ts";
import DeleteAccount from "./commands/deleteAccount.ts";
import type AppSecrets from "../../../packages/secret";
import type {GoogleTokenVerifier} from "../../domain/user/googleIdentity.ts";
import AuthenticateGoogleToken from "./commands/authenticateGoogleToken.ts";
import type {PaymentGateway, SubscriptionRepository} from "../../domain/billing";

/** What deleting an account needs to end its paid plan. */
export type AccountBilling = {
    paymentGateway: PaymentGateway
    subscriptionRepository: SubscriptionRepository
}

export class Commands {
    authenticate: Authenticate
    authenticateGoogleToken: AuthenticateGoogleToken
    deleteAccount: DeleteAccount

    constructor(userRepository: Repository, appSecrets: AppSecrets, googleTokenVerifier: GoogleTokenVerifier, billing: AccountBilling) {
        this.authenticate = new Authenticate(userRepository)
        this.authenticateGoogleToken = new AuthenticateGoogleToken(googleTokenVerifier, this.authenticate)
        this.deleteAccount = new DeleteAccount(userRepository, billing.paymentGateway, billing.subscriptionRepository)
    }

}

export class Queries {
    getDetails: GetDetails

    constructor(userRepository: Repository) {
        this.getDetails = new GetDetails(userRepository)
    }
}

export default class AuthenticationService {
    commands: Commands
    queries: Queries

    constructor(userRepository: Repository, appSecrets: AppSecrets, googleTokenVerifier: GoogleTokenVerifier, billing: AccountBilling) {
        this.commands = new Commands(userRepository, appSecrets, googleTokenVerifier, billing)
        this.queries = new Queries(userRepository)
    }
}