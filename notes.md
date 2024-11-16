## Usage ideas

Run `surrealkit` (or `pnpx surrealkit`?) to open the interactive cli

It will start by searching for a `surrealkit.config.js` file. If there isn't one, confirm that you
want to create one. Maybe add SURREAL_USER, etc. to .env file

"If you don't already, make sure to set these environment variables:"

```
SURREAL_ENDPOINT=
SURREAL_NAMESPACE=
SURREAL_DATABASE=
SURREAL_USER=
SURREAL_PASSWORD=
```

If the config file exists already, `surrealkit` will start
the interactive cli for managing migrations and backups (maybe?)
And maybe I can use commander or something to skip the interactive cli if you want to run things quicker.

## Folder structure

```
.
├── surrealkit.config.js
└── db/
    ├── migrations/
    │   └── 20242709-create-user-table.surql
    └── schema/
        └── user.surql
```

## Testing

```
.
└── tests/
    ├── index.ts
    └── create-table/
        ├── output.surql
        ├── migrations/
        │   └── 20242709-create-user-table.surql
        ├── schema-start/
        │   └── user.surql
        └── schema-steps/
            └── or some way of handling multi-step migrations
```

## To-do

If a field update includes a `<future>`, maybe run `update` for existing fields too
Maybe make a note about `OVERRIDE` if you do documentation

- `OVERRIDE` shouldn't need to be used in `/schema` files - It is assumed that the current schema will always overwrite the previous, if a table/field/function changes
- `/migration` files will add `OVERWRITE`
