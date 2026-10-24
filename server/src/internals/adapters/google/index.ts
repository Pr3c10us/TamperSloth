import type {GoogleIdentity, GoogleTokenVerifier} from "../../domain/user/googleIdentity.ts";
import {ServiceUnavailableError, UnAuthorizedError} from "../../../packages/errors";

const TOKEN_INFO_URL = "https://www.googleapis.com/oauth2/v3/tokeninfo"

type TokenInfo = {
    aud?: string
    azp?: string
    sub?: string
    email?: string
    email_verified?: string | boolean
    expires_in?: string
}

/**
 * Verifies access tokens from chrome.identity.getAuthToken (the manifest's
 * client) or launchWebAuthFlow (the web client, for Edge and others) with Google's
 * tokeninfo endpoint; GOOGLE_EXTENSION_CLIENT_ID lists both, comma-separated. The audience check is what makes this safe: a token
 * Google issued to any other app is refused, so one can't be replayed here.
 */
export default class GoogleTokenVerifierHTTP implements GoogleTokenVerifier {
    constructor(private clientIds: string[], private transport: typeof fetch = fetch) {
    }

    async verify(accessToken: string): Promise<GoogleIdentity> {
        if (this.clientIds.length === 0) throw new ServiceUnavailableError("Google sign-in isn't configured")

        let response: Response
        try {
            response = await this.transport(`${TOKEN_INFO_URL}?access_token=${encodeURIComponent(accessToken)}`)
        } catch (error) {
            console.error("google tokeninfo unreachable", error)
            throw new ServiceUnavailableError("Couldn't reach Google to check the sign-in, try again")
        }
        // Google answers 400 for expired, revoked or malformed tokens.
        if (!response.ok) throw new UnAuthorizedError("Google sign-in has expired, try again")

        const info = await response.json() as TokenInfo
        const audience = info.aud ?? info.azp
        if (!audience || !this.clientIds.includes(audience)) throw new UnAuthorizedError("Google sign-in wasn't made for TamperSloth")
        if (!info.sub || !info.email) throw new UnAuthorizedError("Google didn't share an email address; allow email access and try again")
        if (info.email_verified !== true && info.email_verified !== "true") throw new UnAuthorizedError("Verify your Google email address first")
        if (Number(info.expires_in) <= 0) throw new UnAuthorizedError("Google sign-in has expired, try again")

        return {googleId: info.sub, email: info.email.toLowerCase()}
    }
}
