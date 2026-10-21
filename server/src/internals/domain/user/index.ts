export type User = {
    id: string
    email: string
    googleId?: string
    createdAt: string
    updatedAt: string
    plan: string
}

export type GetUserParameters = {
    id?: string
    email?: string
    googleId?: string
}