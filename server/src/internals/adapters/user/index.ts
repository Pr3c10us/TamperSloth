import type {GetUserParameters, User} from "../../domain/user";
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
                   google_id,
                   created_at,
                   updated_at,
                   plan
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
            googleId: row.google_id,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            plan: row.plan
        };
    }

    async add(user: Omit<User, "id" | "createdAt" | "updatedAt" | "streak" | "xp" | "plan">): Promise<User> {
        const userData = {
            email: user.email,
            ...(user.googleId && {google_id: user.googleId}),
        };

        const [newUser] = await this.sql`
            INSERT INTO users ${this.sql(userData)}
                RETURNING id, email, google_id, created_at, updated_at, plan
        `;

        return {
            id: newUser.id,
            email: newUser.email,
            ...(newUser.googleId && {google_id: user.googleId}),
            createdAt: newUser.created_at,
            updatedAt: newUser.updated_at,
            plan: newUser.plan
        };
    };

    async update(id: string, user: Partial<Omit<User, "id" | "createdAt" | "updatedAt">>): Promise<User> {
        let setUser = {
            ...user,
        }

        const [newUser] = await this.sql`
            UPDATE users
            SET ${this.sql(setUser)}
            WHERE id = ${id}
            RETURNING id, email, google_id, created_at, updated_at, plan
        `;

        return {
            id: newUser.id,
            email: newUser.email,
            ...(newUser.googleId && {google_id: user.googleId}),
            createdAt: newUser.created_at,
            updatedAt: newUser.updated_at,
            plan: newUser.plan
        };
    };

    async delete(id: string): Promise<void> {
        await this.sql`DELETE
                       FROM users
                       WHERE id = ${id}`;
    };
}