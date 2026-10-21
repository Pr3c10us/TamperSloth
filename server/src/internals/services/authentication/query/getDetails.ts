import type Repository from "../../../domain/user/repository.ts";
import type {GetUserParameters, User} from "../../../domain/user";
import {NotFoundError} from "../../../../packages/errors";

export default class GetDetails {
    userRepository: Repository

    constructor(userRepository: Repository) {
        this.userRepository = userRepository
    }

    async handle(parameters: GetUserParameters): Promise<User> {
        return  await this.userRepository.get(parameters)
    }
}