# `Surreal Kit`

A CLI tool for managing SurrealDB migrations

> [!IMPORTANT]  
> Minimum SurrealDB version: 2.0.0

## Project structure

`surrealkit` will look for schema and migration files under the `surreal` directory.

## Command overview

> [!NOTE]
> When using the CLI you can use the command `surrealkit`, or the abbreviated alias `surkit` (sounds like "circuit")

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

## Unsupported features

At the moment, `surrealkit` only supports a single database per project.

The diff command uses the `INFO FOR ...` commands to get the current state of the database.
The following info keys are not currently supported:

- `users` at any level, to avoid committing passwords to version control.
- `accesses` at the root and namespace level, since only a single database is supported per project.
- `models` (`INFO FOR DB`), because they are not created using the `DEFINE` statement.
- `lives` (`INFO FOR TABLE`), because they are not created using the `DEFINE` statement.
- `tables` (`INFO FOR TABLE`), because those are managed by SurrealDB
