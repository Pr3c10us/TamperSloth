import type {User} from "../../../domain/user";
import type {GoogleTokenVerifier} from "../../../domain/user/googleIdentity.ts";
import type Authenticate from "./authenticate.ts";

/** Signs in (or signs up) the Google account behind an access token from the extension. */
export default class AuthenticateGoogleToken {
    constructor(private verifier: GoogleTokenVerifier, private authenticate: Authenticate) {
    }

    async handle(accessToken: string): Promise<User> {
        const identity = await this.verifier.verify(accessToken)
        return this.authenticate.handle(identity.email, identity.googleId)
    }
}
