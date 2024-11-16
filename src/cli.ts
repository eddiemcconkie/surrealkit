// #! /usr/bin/env node

import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { Command } from 'commander';
import getPort from 'get-port';
import dotenv from 'dotenv';
import {
	DB,
	type TableInfo,
	type DBInfo,
	type SubDir,
	dbDefinitionGroups,
	type DBDefinitionGroup,
	tableDefinitionGroups,
} from './surreal-server.js';

dotenv.config();

// Set up surreal directory
const rootPath = path.join(process.cwd(), 'surreal');
const schemaPath = path.join(rootPath, 'schema');
const migrationsPath = path.join(rootPath, 'migrations');

// Maybe only mkdir for certain commands
if (!fs.existsSync(rootPath)) {
	fs.mkdirSync(rootPath, { recursive: true });
	console.log(`Created surreal directory in project root.`);
}
fs.mkdirSync(schemaPath, { recursive: true });
fs.mkdirSync(migrationsPath, { recursive: true });

// Create CLI
const program = new Command();

program
	.name('surrealkit')
	.description('CLI tool for managing SurrealDB migrations and backups');

program
	.command('new <migration-name>')
	.description('create a new data migration')
	.action(async (migrationName) => {
		await createMigrationFile(migrationName, false);
	});

program
	.command('diff <migration-name>')
	.description('create a migration to match the updated schema')
	.action(async (migrationName) => {
		await createMigrationFile(migrationName, true);
	});

program
	.command('migrate')
	.description('run all migrations')
	.action(async () => {
		await runMigrations();
	});

program.parse(process.argv);

// Helpers
async function runMigrations() {
	using db = new DB({
		type: 'persistent',
		endpoint: getEnv('SURREALKIT_ENDPOINT'),
		namespace: getEnv('SURREAL_NAMESPACE'),
		database: getEnv('SURREAL_DATABASE'),
		user: getEnv('SURREAL_USER'),
		password: getEnv('SURREAL_PASS'),
	});
	await db.connect();
	await db.setup();

	await db.sendQuery(
		`DEFINE TABLE IF NOT EXISTS surrealkit_migration SCHEMAFULL TYPE NORMAL PERMISSIONS NONE`,
	);
	await db.sendQuery(
		`DEFINE FIELD IF NOT EXISTS name ON surrealkit_migration TYPE string PERMISSIONS NONE`,
	);

	const runMigrations = await db.sendQuery<string[]>(
		`SELECT VALUE name FROM surrealkit_migration ORDER BY name ASC`,
	);
	const allMigrationNames = fs.readdirSync(migrationsPath);

	if (runMigrations.length > allMigrationNames.length) {
		console.error(
			'Migrations out of sync: There are more migrations in the database than on disk.',
		);
		process.exit(1);
	}

	if (runMigrations.length === allMigrationNames.length) {
		console.log('Migrations are up to date.');
		process.exit();
	}

	for (let i = 0; i < runMigrations.length; i++) {
		if (runMigrations[i] !== allMigrationNames[i]) {
			console.error(
				'Out of sync migrations: There are migrations on disk that come before the last run migration, but are not in the database.',
			);
			process.exit(1);
		}
	}

	console.log('Running migrations...');
	for (let i = runMigrations.length; i < allMigrationNames.length; i++) {
		const migrationName = allMigrationNames[i];
		if (!migrationName) {
			console.error('Migration name missing.');
			process.exit(1);
		}
		await db.validateAndImportSingleFile(
			path.join(migrationsPath, migrationName),
		);
		await db.sendQuery(
			`CREATE surrealkit_migration SET name = type::string('${migrationName}')`,
		);
	}
}

async function createMigrationFile(
	migrationName: string,
	isSchemaMigration: boolean,
) {
	const now = new Date();
	const fileName = `${now
		.toISOString()
		.replace(/[-T:.]/g, '')
		.slice(0, 15)}-${migrationName}.surql`;
	const filePath = path.join(migrationsPath, fileName);

	const fileContents = isSchemaMigration
		? await getSchemaMigrationContents()
		: '';

	// Data migration, or a schema migration that requires changes
	if (!isSchemaMigration || fileContents !== '') {
		const heading = isSchemaMigration
			? '-- GENERATED SCHEMA MIGRATION: This file should not be edited. Modify the schema instead.\n\n'
			: '';
		fs.writeFileSync(filePath, heading + fileContents);
		console.log(`Created ${fileName}`);

		exec(`code ${filePath}`);
	} else if (isSchemaMigration) {
		console.log('Schema is up to date. No migrations created.');
	}
}

function getEnv(key: string) {
	const value = process.env[key];
	if (!value) {
		throw new Error(`Missing environment variable: ${key}`);
	}
	return value;
}

function getEnvOr(key: string, defaultValue: string) {
	const value = process.env[key];
	if (!value) {
		return defaultValue;
	}
	return value;
}

async function getSchemaMigrationContents() {
	// Get the current state of the database for migrations and schema
	console.log('\nGetting current database state from migration files');
	const migrationState = await getDBState('migrations');
	console.log('\nGetting current database state from schema files');
	const schemaState = await getDBState('schema');

	const definitions: string[] = [];

	// For each DB definition group (tables, functions, params, etc)...
	for (const dbDefinitionGroup of dbDefinitionGroups) {
		// Get all definitions for this DB info key
		const migrationDBDefinitions = migrationState.dbInfo[dbDefinitionGroup];
		const schemaDBDefinitions = schemaState.dbInfo[dbDefinitionGroup];

		// Get all definition keys across migrations and schema
		const allDBDefinitionKeys = new Set([
			...Object.keys(migrationDBDefinitions),
			...Object.keys(schemaDBDefinitions),
		]);
		// Compare the migrations definition to the schema definition
		for (const dbDefinitionKey of allDBDefinitionKeys) {
			const migrationDefinition = migrationDBDefinitions[dbDefinitionKey];
			const schemaDefinition = schemaDBDefinitions[dbDefinitionKey];

			if (
				migrationDefinition &&
				schemaDefinition &&
				migrationDefinition !== schemaDefinition
			) {
				// Both definitions exist and are different -> overwrite
				definitions.push(
					formatDBDefinition(schemaDefinition, 'overwrite', dbDefinitionGroup),
				);
			} else if (schemaDefinition && !migrationDefinition) {
				// Schema includes a definition that doesn't exist in migrations -> define
				definitions.push(schemaDefinition);
			} else if (migrationDefinition && !schemaDefinition) {
				// Migrations includes a definition that doesn't exist in schema -> remove
				definitions.push(
					formatDBDefinition(migrationDefinition, 'remove', dbDefinitionGroup),
				);
				// If a table is removed, we can skip the next step because all of the table's
				// definitions will be removed as well.
				continue;
			}

			if (dbDefinitionGroup === 'tables') {
				// For each table info key (events, fields, indexes)...
				for (const tableInfoKey of tableDefinitionGroups) {
					// Get all definitions for this table info key
					const migrationTableDefinitions =
						migrationState.tableInfo[dbDefinitionKey]?.[tableInfoKey];
					const schemaTableDefinitions =
						schemaState.tableInfo[dbDefinitionKey]?.[tableInfoKey];

					// Get all definition keys across migrations and schema
					const allTableDefinitionKeys = new Set([
						...Object.keys(migrationTableDefinitions ?? {}),
						...Object.keys(schemaTableDefinitions ?? {}),
					]);
					// Compare the migrations definition to the schema definition
					for (const tableDefinitionKey of allTableDefinitionKeys) {
						const migrationTableDefinition =
							migrationTableDefinitions?.[tableDefinitionKey];
						const schemaTableDefinition =
							schemaTableDefinitions?.[tableDefinitionKey];

						if (
							migrationTableDefinition &&
							schemaTableDefinition &&
							migrationTableDefinition !== schemaTableDefinition
						) {
							definitions.push(
								formatTableDefinition(schemaTableDefinition, 'overwrite'),
							);
						} else if (schemaTableDefinition && !migrationTableDefinition) {
							definitions.push(schemaTableDefinition);
						} else if (migrationTableDefinition && !schemaTableDefinition) {
							definitions.push(
								formatTableDefinition(migrationTableDefinition, 'remove'),
							);
						}
					}
				}
			}
		}
	}

	return definitions.map((d) => `${d};`).join('\n\n');
}

async function getDBState(fileType: SubDir) {
	const port = await getPort();
	using db = new DB({
		type: 'memory',
		port: port,
		user: 'root',
		password: 'root',
		namespace: 'surrealkit',
		database: 'migrations',
	});

	await db.connect();
	await db.setup();
	await db.importDirectory(fileType);

	const dbInfo = await db.sendQuery<DBInfo>('INFO FOR DB');

	const tableInfo: Record<string, TableInfo> = Object.fromEntries(
		await Promise.all(
			Object.keys(dbInfo.tables).map(async function (table) {
				const info = await db.sendQuery<TableInfo>(`INFO FOR TABLE ${table}`);
				return [table, info] as const;
			}),
		),
	);

	return { dbInfo, tableInfo };
}

function formatDBDefinition(
	definition: string,
	action: 'overwrite' | 'remove',
	dbInfoKey: DBDefinitionGroup,
) {
	const regexPrefix =
		dbInfoKey === 'functions' ? 'fn::' : dbInfoKey === 'params' ? '\\$' : '';
	const outputPrefix = regexPrefix.replace('\\', '');

	const definitionRegex = new RegExp(
		`^DEFINE (?<defining>\\w+) ${regexPrefix}(?<name>\\w+)(?<rest>.*)$`,
	);

	const match = definition.match(definitionRegex);
	if (!match) {
		throw new Error(`Invalid definition: ${definition}`);
	}

	const { defining, name, rest } = match.groups as Record<
		'defining' | 'name' | 'rest',
		string
	>;

	if (action === 'overwrite')
		return `DEFINE ${defining} OVERWRITE ${outputPrefix}${name}${rest}`;

	return `REMOVE ${defining} IF EXISTS ${outputPrefix}${name}${
		dbInfoKey === 'accesses' ? ' ON DATABASE' : ''
	}`;
}

function formatTableDefinition(
	definition: string,
	action: 'overwrite' | 'remove',
) {
	const definitionRegex =
		/^DEFINE (?<defining>\w+) (?<name>\w+) ON (?<table>\w+)(?<rest>.*)$/;

	const match = definition.match(definitionRegex);
	if (!match) {
		throw new Error(`Invalid definition: ${definition}`);
	}

	const { defining, name, table, rest } = match.groups as Record<
		'defining' | 'name' | 'table' | 'rest',
		string
	>;

	if (action === 'overwrite')
		return `DEFINE ${defining} OVERWRITE ${name} ON ${table}${rest}`;

	return `REMOVE ${defining} IF EXISTS ${name} ON ${table}`;
}
