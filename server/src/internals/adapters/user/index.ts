import type {GetUserParameters, SetNullParameters, User} from "../../domain/user/index.ts";
import type Repository from "../../domain/user/repository.ts";
import {SQL} from "bun";
import {NotFoundError} from "../../../packages/errors";

export default class UserRepositoryPG implements Repository {
    sql: SQL

    constructor(postgresClient: SQL) {
        this.sql = postgresClient
    }

    async get(parameter: GetUserParameters): Promise<User> {
        const conditions: any[] = [];

        if (parameter.id) {
            conditions.push(this.sql`id = ${parameter.id}`);
        }

        if (parameter.email) {
            conditions.push(this.sql`email = ${parameter.email}`);
        }

        if (parameter.googleId) {
            conditions.push(this.sql`google_id = ${parameter.googleId}`);
        }

        if (parameter.username) {
            conditions.push(this.sql`username = ${parameter.username}`);
        }

        // If no conditions provided, throw error or return null
        if (conditions.length === 0) {
            throw new Error('At least one search parameter must be provided');
        }

        // Join conditions with AND
        const whereClause = conditions.reduce((acc, condition, index) => {
            if (index === 0) {
                return condition;
            }
            return this.sql`${acc} AND ${condition}`;
        });

        const rows = await this.sql`
            SELECT id,
                   email,
                   password,
                   google_id,
                   username,
                   email_verified,
                   streak,
                   xp,
                   created_at,
                   updated_at,
                   custom_prompt,
                   api_key
            FROM users
            WHERE ${whereClause}
            LIMIT 1
        `;

        if (rows.length === 0) {
            throw new NotFoundError("user does not exist")
        }

        // Map database row to User object
        const row = rows[0];
        return {
            id: row.id,
            email: row.email,
            password: row.password,
            googleId: row.google_id,
            username: row.username,
            emailVerified: row.email_verified,
            streak: row.streak,
            xp: row.xp,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            customPrompt: row.custom_prompt,
            apiKey: row.api_key
        };
    }

    async add(user: Omit<User, "id" | "createdAt" | "updatedAt" | "streak" | "xp">): Promise<User> {
        const userData = {
            email: user.email,
            ...(user.googleId && {google_id: user.googleId}),
            ...(user.username && {username: user.username}),
            ...(user.password && {password: user.password}),
            ...(user.emailVerified && {email_verified: user.emailVerified}),
            ...(user.customPrompt && {custom_prompt: user.customPrompt}),
            ...(user.apiKey && {api_key: user.apiKey})
        };

        const [newUser] = await this.sql`
            INSERT INTO users ${this.sql(userData)}
                RETURNING id, email, password, google_id, username, email_verified, streak, xp, created_at, updated_at, custom_prompt, api_key
        `;

        return {
            id: newUser.id,
            email: newUser.email,
            ...(newUser.googleId && {google_id: user.googleId}),
            ...(newUser.username && {username: user.username}),
            emailVerified: newUser.email_verified,
            streak: newUser.streak,
            xp: newUser.xp,
            createdAt: newUser.created_at,
            updatedAt: newUser.updated_at,
            customPrompt: newUser.custom_prompt,
            apiKey: newUser.api_key

        };
    };

    async update(id: string, user: Partial<Omit<User, "id" | "createdAt" | "updatedAt">>): Promise<User> {
        let setUser = {
            ...user,
            ...(user.emailVerified && {email_verified: user.emailVerified}),
            ...(user.customPrompt && {custom_prompt: user.customPrompt}),
            ...(user.apiKey && {api_key: user.apiKey})
        }
        delete setUser.emailVerified
        delete setUser.customPrompt
        delete setUser.apiKey

        const [newUser] = await this.sql`
            UPDATE users
            SET ${this.sql(setUser)}
            WHERE id = ${id}
            RETURNING id, email, password, google_id, username, email_verified, streak, xp, created_at, updated_at, custom_prompt, api_key
        `;

        return {
            id: newUser.id,
            email: newUser.email,
            ...(newUser.googleId && {google_id: user.googleId}),
            ...(newUser.username && {username: user.username}),
            emailVerified: newUser.email_verified,
            streak: newUser.streak,
            xp: newUser.xp,
            createdAt: newUser.created_at,
            updatedAt: newUser.updated_at,
            customPrompt: newUser.custom_prompt,
            apiKey: newUser.api_key

        };
    };

    async setNull(id: string, parameter: SetNullParameters): Promise<void> {
        if (parameter.apiKey) {
           await this.sql`Update users set api_key = NULL where id = ${id}`
        }
        if (parameter.customPrompt) {
           await this.sql`Update users set custom_prompt = NULL where id = ${id}`
        }
    }

    async delete(id: string): Promise<void> {
        await this.sql`DELETE
                       FROM users
                       WHERE id = ${id}`;
    };
}