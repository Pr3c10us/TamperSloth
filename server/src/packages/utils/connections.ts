import {SQL} from "bun";
import type {PostgresCredentials} from "../secret";

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