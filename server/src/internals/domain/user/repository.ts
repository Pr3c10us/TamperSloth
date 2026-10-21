import type {GetUserParameters, User} from "./index.ts";

export default interface Repository {
    get: (parameter: GetUserParameters) => Promise<User>
    add: (user: Omit<User, "id" | "createdAt" | "updatedAt"| "plan">) => Promise<User>
    update: (id: string, user: Partial<Omit<User, "id" | "createdAt" | "updatedAt">>) => Promise<User>
    delete: (id: string) => Promise<void>
}