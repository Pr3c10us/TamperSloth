import {User as AppUser} from '../../internals/domain/user/index.ts'
import type {Challenge} from "../../internals/domain/challenge";

declare global {
    namespace Express {
        export interface Request {
            user: AppUser
            challenge: Challenge
            signedCookies?: any;
        }
    }
}
