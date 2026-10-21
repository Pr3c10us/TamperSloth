import {SQL} from "bun";
import AppSecrets from "../../packages/secret";
import type {S3Client} from "@aws-sdk/client-s3";
import type UserRepository from "../domain/user/repository.ts";
import UserRepositoryPG from "./user";

export type AdapterParameters = {
    postgresClient: SQL
    appSecrets: AppSecrets
}

export default class Adapters {
    parameters: AdapterParameters
    userRepository: UserRepository

    constructor(parameters: AdapterParameters) {
        this.parameters = parameters
        this.userRepository = new UserRepositoryPG(parameters.postgresClient)
    }
}