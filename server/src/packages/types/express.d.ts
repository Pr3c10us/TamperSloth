import {User as AppUser} from '../../internals/domain/user/index.ts'

declare global {
    namespace Express {
        export interface Request {
            user: AppUser
        }
    }
}
