import {SQL} from "bun";
import Redis from "ioredis";
import type {PostgresCredentials, RedisCredentials} from "../secret";

export const bunPostgresClientConnection = (credentials: PostgresCredentials) => {
    return new SQL({
        host: credentials.host,
        port: credentials.port,
        database: credentials.db,
        username: credentials.user,
        password: credentials.password,
        ssl: credentials.ssl ? {serverName: credentials.host} : false, // SNI — most managed providers need this

        onconnect: client => {
        },
        onclose: client => {
        },
    });
}

export const redisClientConnection = (credentials: RedisCredentials) => {
    const client = new Redis({
        host: credentials.host,
        port: credentials.port,
        username: credentials.user || undefined,
        password: credentials.password || undefined,
        tls: credentials.tls ? {servername: credentials.host} : undefined,
    });
    client.on("error", error => console.error("redis connection error", error.message));
    return client;
}