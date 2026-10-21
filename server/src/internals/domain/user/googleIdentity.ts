export type GoogleIdentity = {
    googleId: string
    email: string
}

/** Checks a Google OAuth access token and says whose it is. */
export interface GoogleTokenVerifier {
    /** Throws UnAuthorizedError unless the token is live, ours and carries a verified email. */
    verify: (accessToken: string) => Promise<GoogleIdentity>
}
