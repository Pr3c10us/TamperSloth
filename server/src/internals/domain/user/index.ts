export type User = {
    id: string
    email: string
    password?: string
    googleId?: string
    username?: string
    emailVerified: boolean
    streak: number
    xp: number
    createdAt: string
    updatedAt: string
    customPrompt?: string
    apiKey?: string
}

export type GetUserParameters = {
    id?: string
    email?: string
    googleId?: string
    username?: string
}

export type SetNullParameters = {
    customPrompt?: boolean
    apiKey?: boolean
}