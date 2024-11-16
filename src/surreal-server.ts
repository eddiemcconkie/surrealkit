import { ChildProcess, execSync, spawn } from 'child_process';
import * as fs from 'fs';
import { globSync } from 'glob';

type Definitions = Record<string, string>;

export const dbDefinitionGroups = [
	'accesses',
	'analyzers',
	'configs',
	'functions',
	'params',
	'tables',
] as const;
export type DBDefinitionGroup = (typeof dbDefinitionGroups)[number];
export type DBInfo = Record<DBDefinitionGroup, Definitions>;

export const tableDefinitionGroups = ['events', 'fields', 'indexes'] as const;
export type TableDefinitionGroup = (typeof tableDefinitionGroups)[number];
export type TableInfo = Record<TableDefinitionGroup, Definitions>;

type SurrealServerConfig = {
	namespace: string;
	database: string;
	user: string;
	password: string;
} & (
	| { type: 'memory'; port: number }
	| { type: 'persistent'; endpoint: string }
);

export type SubDir = 'schema' | 'migrations';

export class DB implements Disposable {
	private server?: ChildProcess;
	// client: Surreal;

	constructor(private config: SurrealServerConfig) {
		if (config.type === 'memory') {
			this.server = spawn(
				'surreal',
				[
					'start',
					'memory',
					'--bind',
					this.getEndpoint(false),
					'--no-banner',
					'--log',
					'error',
				],
				{ stdio: 'inherit' },
			);
		}
	}

	async connect() {
		console.log(
			`\nConnecting to ${this.config.type === 'memory' ? 'in-memory ' : ''}database at ${this.getEndpoint()}\n`,
		);
		let attempts = 0;
		let attemptWaitDuration = 200;
		while (attempts < 10) {
			try {
				await new Promise((resolve) =>
					setTimeout(resolve, attemptWaitDuration),
				);
				execSync(`surreal is-ready --endpoint ${this.getEndpoint()}`);
				return true;
			} catch {
				attempts++;
				attemptWaitDuration *= 1.5;
				console.log('Retrying connection...');
			}
		}

		throw new Error('Took too long to connect to database');
	}

	async setup() {
		if (this.config.type === 'memory') {
			await this.sendQuery(
				`DEFINE NAMESPACE IF NOT EXISTS ${this.config.namespace}`,
			);
			await this.sendQuery(
				`DEFINE DATABASE IF NOT EXISTS ${this.config.database}`,
			);
		}
	}

	private getEndpoint(withProtocol = true) {
		if (this.config.type === 'memory') {
			return `${withProtocol ? 'http://' : ''}127.0.0.1:${this.config.port}`;
		}
		return this.config.endpoint.startsWith('http')
			? this.config.endpoint
			: `http://${this.config.endpoint}`;
	}

	async sendQuery<T = unknown>(query: string) {
		const output = execSync(
			`echo "${query}" | surreal sql --json --endpoint ${this.getEndpoint()} --namespace ${this.config.namespace} --database ${this.config.database} --user ${this.config.user} --pass ${this.config.password} --hide-welcome`,
		).toString();

		return JSON.parse(output)[0] as T;
	}

	async validateAndImportSingleFile(file: string) {
		console.log(`Validating ${file}...`);
		execSync(`surreal validate ${file}`);
		console.log(`Importing ${file}`);
		execSync(
			`surreal import --endpoint ${this.getEndpoint()} --namespace ${this.config.namespace} --database ${this.config.database} --user ${this.config.user} --pass ${this.config.password} ${file}`,
		);
	}

	async importDirectory(subDir: SubDir) {
		if (this.config.type !== 'memory') {
			throw new Error('Can only import files in memory mode');
		}

		const files =
			subDir === 'schema'
				? globSync(`surreal/${subDir}/**/*.surql`)
				: fs
						.readdirSync(`surreal/${subDir}`)
						.filter((f) => f.endsWith('.surql'))
						.map((f) => `surreal/${subDir}/${f}`)
						.sort();

		if (files.length === 0) return;

		console.log(`Validating ${subDir}...\n`);
		execSync(`surreal validate surreal/${subDir}/**/*.surql`);

		for (const file of files) {
			console.log(`Importing ${file}`);
			console.log(this.getEndpoint(), file);
			execSync(
				`surreal import --endpoint ${this.getEndpoint()} --namespace ${this.config.namespace} --database ${this.config.database} --user ${this.config.user} --pass ${this.config.password} ${file}`,
			);
		}
	}

	[Symbol.dispose]() {
		this.server?.kill();
	}
}
