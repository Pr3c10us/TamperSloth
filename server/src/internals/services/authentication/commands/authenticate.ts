import type Repository from "../../../domain/user/repository.ts";
import type {User} from "../../../domain/user";
import {NotFoundError} from "../../../../packages/errors";

export default class Authenticate {
    userRepository: Repository

    constructor(userRepository: Repository) {
        this.userRepository = userRepository
    }

    async handle(email: string, googleId: string): Promise<User> {
        let user: User
        try {
            user = await this.userRepository.get({googleId})
        } catch (e) {
            if (e instanceof NotFoundError) {
                user = await this.userRepository.add({
                    email, googleId, emailVerified: true,
                })
            }  else {
                throw e
            }
        }
        return user
    }
}