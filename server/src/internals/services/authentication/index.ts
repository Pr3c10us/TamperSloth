import type Repository from "../../domain/user/repository.ts";
import Authenticate from "./commands/authenticate.ts";
import GetDetails from "./query/getDetails.ts";
import DeleteAccount from "./commands/deleteAccount.ts";
import type AppSecrets from "../../../packages/secret";

export class Commands {
    authenticate: Authenticate
    deleteAccount: DeleteAccount

    constructor(userRepository: Repository, appSecrets: AppSecrets) {
        this.authenticate = new Authenticate(userRepository)
        this.deleteAccount = new DeleteAccount(userRepository)
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

    constructor(userRepository: Repository, appSecrets: AppSecrets) {
        this.commands = new Commands(userRepository, appSecrets)
        this.queries = new Queries(userRepository)
    }
}