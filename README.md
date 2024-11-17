# `Surreal Kit`

A CLI tool for managing SurrealDB migrations

> [!IMPORTANT]  
> Minimum SurrealDB version: 2.0.0

## Command overview

> [!NOTE]
> When using the CLI you can use the command `surrealkit`, or the abbreviated alias `surkit` (sounds like circuit)

### Create a new schema migration

```bash
surkit diff <migration-name>
```

`surrealkit` will generate a new migration file by diffing your schema files and your migration files to determine what changes need to be made.

### Create a new data migration

```bash
surkit new <migration-name>
```

`surrealkit` will generate a blank migration file for you to fill in with a manual data migration.

### Run migrations

```bash
surkit migrate
```

`surrealkit` will run all migrations in the `migrations` directory.

## Project structure

`surrealkit` stores its data in the `surreal` directory, with `migrations` and `schema` subdirectories.
If the directories don't exist, the CLI will create them for you automatically when you run it.

The `data` subdirectory is reserved for your use during local development in case you want to keep your data with the rest of your `surrealkit` files.
i.e. you could set the `SURREAL_PATH` env variable to `surrealkv://surreal/data`.
Just remember to add `/surreal/data` to your `.gitignore`.

```
.
└── surreal/
    ├── data (optional)
    ├── migrations
    └── schema
```

For now, it is recommended that you don't add any additional subdirectories to `surreal`
to avoid conflicts with backup/snapshot directories that may exist in the future.

## Environment variables

`surrealkit` makes use of some of [SurrealDB's environment variables](https://surrealdb.com/docs/surrealdb/cli/env#command-environment-variables) in order to connect to your database to run migrations.
For `surrealkit` to work properly, you will need to set the following environment variables:

```properties
# .env
SURREAL_NAMESPACE=...
SURREAL_DATABASE=...
SURREAL_USER=...
SURREAL_PASS=...
SURREALKIT_ENDPOINT=...
```

The first four are SurrealDB variables which will also work with regular Surreal CLI commands like `surreal start` or `surreal sql`.
SurrealDB doesn't have an env variable dedicated to the endpoint, so `surrealkit` uses `SURREALKIT_ENDPOINT` for that purpose.

During local development, you may want to set the `SURREAL_BIND` variable, which is used by the `surreal start` command, and use it to set the `SURREALKIT_ENDPOINT` variable.

```properties
SURREAL_BIND=127.0.0.1:5050
SURREALKIT_ENDPOINT=http://${SURREAL_BIND}
```

## Unsupported features

At the moment, `surrealkit` only supports a single database per project.

The diff command uses the `INFO FOR ...` commands to get the current state of the database.
The following info keys are not currently supported:

- `users` at any level, to avoid committing passwords to version control.
- `accesses` at the root and namespace level, since only a single database is supported per project.
- `models` (`INFO FOR DB`), because they are not created using the `DEFINE` statement.
- `lives` (`INFO FOR TABLE`), because they are not created using the `DEFINE` statement.
- `tables` (`INFO FOR TABLE`), because those are managed by SurrealDB
