var path = require('path');
require('dotenv').config()

var ssl = process.env.POSTGRES_SSL === 'true' ? {
    rejectUnauthorized: false
} : false

// sql-migrations always connects with ssl: false. Give its pg pools our ssl setting
// instead, through the same pg module it loads.
var pg = require(require.resolve('pg', {paths: [path.dirname(require.resolve('sql-migrations'))]}));
var Pool = pg.Pool;
pg.Pool = function (config) {
    return new Pool(Object.assign({}, config, {ssl: ssl}));
};

require('sql-migrations').run({
    migrationsDir: path.resolve(__dirname, 'migrations'),
    host: process.env.POSTGRES_HOST,
    port: parseInt(process.env.POSTGRES_PORT) || 5432,
    db: process.env.POSTGRES_DB,
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
    adapter: 'pg'
});
