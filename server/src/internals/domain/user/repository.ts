import type {GetUserParameters, SetNullParameters, User} from "./index.ts";

export default interface Repository {
    get: (parameter: GetUserParameters) => Promise<User>
    add: (user: Omit<User, "id" | "createdAt" | "updatedAt" | "streak" | "xp">) => Promise<User>
    update: (id: string, user: Partial<Omit<User, "id" | "createdAt" | "updatedAt">>) => Promise<User>
    setNull: (id: string, parameter: SetNullParameters) => Promise<void>
    delete: (id: string) => Promise<void>
}