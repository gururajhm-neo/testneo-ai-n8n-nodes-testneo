import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	JsonObject,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeApiError, NodeOperationError } from 'n8n-workflow';

import {
	asRecord,
	getTestNeoCredentials,
	parseJsonParam,
	testNeoApiRequest,
} from './GenericFunctions';
import {
	dashboardUrl,
	extractExecutionId,
	isPassStatus,
	isTerminalStatus,
	pickStatus,
	sleepMs,
	verdictFromParts,
} from './executionStatus';

const RESOURCE = 'testNeo';

export class TestNeo implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'TestNeo',
		name: 'testNeo',
		icon: { light: 'file:testneo.svg', dark: 'file:testneo.dark.svg' },
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description:
			'Agent-run ingest, semantic assert, golden test execute/poll, and release outcomes — same REST as TestNeo n8n HTTP templates',
		defaults: {
			name: 'TestNeo',
		},
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		usableAsTool: true,
		credentials: [
			{
				name: 'testNeoApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Agent Verification',
						value: RESOURCE,
					},
				],
				default: RESOURCE,
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: [RESOURCE],
					},
				},
				options: [
					{
						name: 'Execute Test Case',
						value: 'executeTestCase',
						action: 'Execute golden test case',
						description: 'POST …/test-cases/{ID}/execute',
					},
					{
						name: 'Get Execution Summary',
						value: 'getExecutionSummary',
						action: 'Get execution summary',
						description: 'GET …/analytics/execution/{ID}/summary (one shot)',
					},
					{
						name: 'Ingest Agent Run',
						value: 'ingestAgentRun',
						action: 'Ingest agent run summary',
						description: 'POST …/unified-contexts/ingest/agent-run (Template 2)',
					},
					{
						name: 'List Outcomes',
						value: 'listOutcomes',
						action: 'List release outcomes',
						description: 'GET /release-readiness/outcomes',
					},
					{
						name: 'Mark Deployed',
						value: 'markDeployed',
						action: 'Create release outcome stub',
						description: 'POST /release-readiness/outcome (Template 3)',
					},
					{
						name: 'Poll Execution',
						value: 'pollExecution',
						action: 'Poll until terminal',
						description: 'Poll execution summary until PASS/FAIL terminal status',
					},
					{
						name: 'Post-Agent Verification',
						value: 'postAgentVerification',
						action: 'Run post-agent verification',
						description:
							'Ingest → semantic assert → execute → poll → PASS/BLOCK (Template 1)',
					},
					{
						name: 'Record Outcome',
						value: 'recordOutcome',
						action: 'Record release outcome',
						description: 'PATCH /release-readiness/outcome/{ID}',
					},
					{
						name: 'Semantic Assert',
						value: 'semanticAssert',
						action: 'Run semantic assert',
						description: 'POST /semantic-assert — claim vs expected meaning',
					},
				],
				default: 'postAgentVerification',
			},

			// ── Shared project ──
			{
				displayName: 'Project ID',
				name: 'projectId',
				type: 'number',
				default: 0,
				required: true,
				displayOptions: {
					show: {
						resource: [RESOURCE],
						operation: [
							'ingestAgentRun',
							'semanticAssert',
							'postAgentVerification',
							'markDeployed',
							'listOutcomes',
						],
					},
				},
				description: 'TestNeo project ID',
			},

			// ── Ingest ──
			{
				displayName: 'Agent Run Summary (JSON)',
				name: 'agentRunSummary',
				type: 'json',
				default: '{}',
				required: true,
				displayOptions: {
					show: {
						resource: [RESOURCE],
						operation: ['ingestAgentRun', 'postAgentVerification'],
					},
				},
				description: 'Agent run summary (agent_run_summary.v1 object; see package README fixtures)',
			},
			{
				displayName: 'Upsert',
				name: 'upsert',
				type: 'boolean',
				default: true,
				displayOptions: {
					show: {
						resource: [RESOURCE],
						operation: ['ingestAgentRun', 'postAgentVerification'],
					},
				},
			},
			{
				displayName: 'Generate Tests',
				name: 'generateTests',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: [RESOURCE],
						operation: ['ingestAgentRun', 'postAgentVerification'],
					},
				},
			},
			{
				displayName: 'Max Tests',
				name: 'maxTests',
				type: 'number',
				default: 6,
				typeOptions: { minValue: 1, maxValue: 50 },
				displayOptions: {
					show: {
						resource: [RESOURCE],
						operation: ['ingestAgentRun', 'postAgentVerification'],
					},
				},
			},

			// ── Semantic ──
			{
				displayName: 'Actual (Agent Claim)',
				name: 'actual',
				type: 'string',
				default: '',
				required: true,
				typeOptions: { rows: 3 },
				displayOptions: {
					show: {
						resource: [RESOURCE],
						operation: ['semanticAssert', 'postAgentVerification'],
					},
				},
			},
			{
				displayName: 'Expected Meaning',
				name: 'expectedMeaning',
				type: 'string',
				default: '',
				required: true,
				typeOptions: { rows: 2 },
				displayOptions: {
					show: {
						resource: [RESOURCE],
						operation: ['semanticAssert', 'postAgentVerification'],
					},
				},
			},
			{
				displayName: 'Similarity Threshold',
				name: 'threshold',
				type: 'number',
				default: 0.75,
				typeOptions: { minValue: 0, maxValue: 1, numberPrecision: 2 },
				displayOptions: {
					show: {
						resource: [RESOURCE],
						operation: ['semanticAssert', 'postAgentVerification'],
					},
				},
			},

			// ── Execute / poll ──
			{
				displayName: 'Test Case ID',
				name: 'testCaseId',
				type: 'number',
				default: 0,
				required: true,
				displayOptions: {
					show: {
						resource: [RESOURCE],
						operation: ['executeTestCase', 'postAgentVerification'],
					},
				},
			},
			{
				displayName: 'Environment Name',
				name: 'environmentName',
				type: 'string',
				default: 'staging',
				displayOptions: {
					show: {
						resource: [RESOURCE],
						operation: ['executeTestCase', 'postAgentVerification'],
					},
				},
			},
			{
				displayName: 'Use Local Agent',
				name: 'useAgent',
				type: 'boolean',
				default: false,
				description:
					'Whether to use the TestNeo local agent for VPN or internal apps. When off, uses cloud execution.',
				displayOptions: {
					show: {
						resource: [RESOURCE],
						operation: ['executeTestCase', 'postAgentVerification'],
					},
				},
			},
			{
				displayName: 'Execution Source',
				name: 'executionSource',
				type: 'string',
				default: 'n8n_post_agent_verification',
				displayOptions: {
					show: {
						resource: [RESOURCE],
						operation: ['executeTestCase', 'postAgentVerification'],
					},
				},
			},
			{
				displayName: 'Skip Execution',
				name: 'skipExecution',
				type: 'boolean',
				default: false,
				description:
					'Whether to skip test execution after semantic assert (contract-only mode).',
				displayOptions: {
					show: {
						resource: [RESOURCE],
						operation: ['postAgentVerification'],
					},
				},
			},
			{
				displayName: 'Execution ID',
				name: 'executionId',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						resource: [RESOURCE],
						operation: ['getExecutionSummary', 'pollExecution'],
					},
				},
			},
			{
				displayName: 'Poll Interval (Seconds)',
				name: 'pollIntervalSec',
				type: 'number',
				default: 8,
				typeOptions: { minValue: 2, maxValue: 120 },
				displayOptions: {
					show: {
						resource: [RESOURCE],
						operation: ['pollExecution', 'postAgentVerification'],
					},
				},
			},
			{
				displayName: 'Poll Timeout (Seconds)',
				name: 'pollTimeoutSec',
				type: 'number',
				default: 600,
				typeOptions: { minValue: 30, maxValue: 3600 },
				displayOptions: {
					show: {
						resource: [RESOURCE],
						operation: ['pollExecution', 'postAgentVerification'],
					},
				},
			},
			{
				displayName: 'Fail Workflow on BLOCK',
				name: 'failOnBlock',
				type: 'boolean',
				default: true,
				description:
					'Whether to throw a NodeOperationError when the verification verdict is BLOCK.',
				displayOptions: {
					show: {
						resource: [RESOURCE],
						operation: ['postAgentVerification'],
					},
				},
			},

			// ── Outcomes ──
			{
				displayName: 'Bundle ID',
				name: 'bundleId',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						resource: [RESOURCE],
						operation: ['markDeployed'],
					},
				},
			},
			{
				displayName: 'Release Name',
				name: 'releaseName',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: [RESOURCE],
						operation: ['markDeployed'],
					},
				},
			},
			{
				displayName: 'Confidence at Ship',
				name: 'confidenceAtShip',
				type: 'number',
				default: 0,
				displayOptions: {
					show: {
						resource: [RESOURCE],
						operation: ['markDeployed'],
					},
				},
			},
			{
				displayName: 'Gate Status at Ship',
				name: 'gateStatusAtShip',
				type: 'string',
				default: 'GATE_PASS',
				displayOptions: {
					show: {
						resource: [RESOURCE],
						operation: ['markDeployed'],
					},
				},
			},
			{
				displayName: 'Limit',
				name: 'limit',
				type: 'number',
				default: 50,
				description: 'Max number of results to return',
				typeOptions: { minValue: 1, maxValue: 100 },
				displayOptions: {
					show: {
						resource: [RESOURCE],
						operation: ['listOutcomes'],
					},
				},
			},
			{
				displayName: 'Outcome ID',
				name: 'outcomeId',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						resource: [RESOURCE],
						operation: ['recordOutcome'],
					},
				},
			},
			{
				displayName: 'Rollback',
				name: 'rollback',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: [RESOURCE],
						operation: ['recordOutcome'],
					},
				},
			},
			{
				displayName: 'Incident Within 7d',
				name: 'incidentWithin7d',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: [RESOURCE],
						operation: ['recordOutcome'],
					},
				},
			},
			{
				displayName: 'Incident Within 30d',
				name: 'incidentWithin30d',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: [RESOURCE],
						operation: ['recordOutcome'],
					},
				},
			},
			{
				displayName: 'Hotfix PR Count',
				name: 'hotfixPrCount',
				type: 'number',
				default: 0,
				displayOptions: {
					show: {
						resource: [RESOURCE],
						operation: ['recordOutcome'],
					},
				},
			},
			{
				displayName: 'Outcome Notes',
				name: 'outcomeNotes',
				type: 'string',
				default: '',
				typeOptions: { rows: 2 },
				displayOptions: {
					show: {
						resource: [RESOURCE],
						operation: ['recordOutcome'],
					},
				},
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			try {
				const operation = this.getNodeParameter('operation', itemIndex) as string;
				const json = await runOperation.call(this, operation, itemIndex);
				returnData.push({ json, pairedItem: { item: itemIndex } });
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: { error: (error as Error).message },
						pairedItem: { item: itemIndex },
					});
					continue;
				}
				throw new NodeApiError(this.getNode(), error as JsonObject, { itemIndex });
			}
		}

		return [returnData];
	}
}

async function runOperation(
	this: IExecuteFunctions,
	operation: string,
	itemIndex: number,
): Promise<IDataObject> {
	switch (operation) {
		case 'ingestAgentRun':
			return ingestAgentRun.call(this, itemIndex);
		case 'semanticAssert':
			return semanticAssert.call(this, itemIndex);
		case 'executeTestCase':
			return executeTestCase.call(this, itemIndex);
		case 'getExecutionSummary':
			return getExecutionSummary.call(this, itemIndex);
		case 'pollExecution':
			return pollExecution.call(this, itemIndex);
		case 'postAgentVerification':
			return postAgentVerification.call(this, itemIndex);
		case 'markDeployed':
			return markDeployed.call(this, itemIndex);
		case 'listOutcomes':
			return listOutcomes.call(this, itemIndex);
		case 'recordOutcome':
			return recordOutcome.call(this, itemIndex);
		default:
			throw new NodeOperationError(this.getNode(), `Unknown operation: ${operation}`, {
				itemIndex,
			});
	}
}

async function ingestAgentRun(this: IExecuteFunctions, itemIndex: number): Promise<IDataObject> {
	const projectId = this.getNodeParameter('projectId', itemIndex) as number;
	const summary = parseJsonParam(this.getNodeParameter('agentRunSummary', itemIndex));
	const upsert = this.getNodeParameter('upsert', itemIndex, true) as boolean;
	const generateTests = this.getNodeParameter('generateTests', itemIndex, false) as boolean;
	const maxTests = this.getNodeParameter('maxTests', itemIndex, 6) as number;

	const body: IDataObject = {
		summary,
		upsert,
		generate_tests: generateTests,
		max_tests: maxTests,
		include_ui_tests: true,
		include_api_tests: true,
	};

	const response = await testNeoApiRequest.call(
		this,
		'POST',
		`/api/web/v1/projects/${projectId}/unified-contexts/ingest/agent-run`,
		body,
	);

	return {
		operation: 'ingestAgentRun',
		...response,
	};
}

async function semanticAssert(this: IExecuteFunctions, itemIndex: number): Promise<IDataObject> {
	const projectId = this.getNodeParameter('projectId', itemIndex) as number;
	const actual = this.getNodeParameter('actual', itemIndex) as string;
	const expectedMeaning = this.getNodeParameter('expectedMeaning', itemIndex) as string;
	const threshold = this.getNodeParameter('threshold', itemIndex, 0.75) as number;

	const response = await testNeoApiRequest.call(this, 'POST', '/api/web/v1/semantic-assert', {
		actual,
		expected_meaning: expectedMeaning,
		threshold,
		project_id: projectId,
	});

	return {
		operation: 'semanticAssert',
		...response,
	};
}

async function executeTestCase(this: IExecuteFunctions, itemIndex: number): Promise<IDataObject> {
	const testCaseId = this.getNodeParameter('testCaseId', itemIndex) as number;
	const environmentName = this.getNodeParameter('environmentName', itemIndex, 'staging') as string;
	const useAgent = this.getNodeParameter('useAgent', itemIndex, false) as boolean;
	const executionSource = this.getNodeParameter(
		'executionSource',
		itemIndex,
		'n8n_post_agent_verification',
	) as string;

	const body: IDataObject = {
		execution_source: executionSource,
		trigger_reason: 'post_agent_gate',
		environment_name: environmentName,
	};
	if (useAgent) {
		body.use_agent = true;
	}

	const response = await testNeoApiRequest.call(
		this,
		'POST',
		`/api/web/v1/test-cases/${testCaseId}/execute`,
		body,
	);

	const executionId = extractExecutionId(asRecord(response));
	const { webAppUrl } = await getTestNeoCredentials.call(this);

	return {
		operation: 'executeTestCase',
		execution_id: executionId,
		dashboard_url: executionId ? dashboardUrl(webAppUrl, executionId) : null,
		...response,
	};
}

async function getExecutionSummary(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject> {
	const executionId = this.getNodeParameter('executionId', itemIndex) as string;
	const response = await testNeoApiRequest.call(
		this,
		'GET',
		`/api/web/v1/analytics/execution/${executionId}/summary`,
	);
	const status = pickStatus(asRecord(response));
	const { webAppUrl } = await getTestNeoCredentials.call(this);

	return {
		operation: 'getExecutionSummary',
		execution_id: executionId,
		status,
		terminal: isTerminalStatus(status),
		passed: isPassStatus(status),
		dashboard_url: dashboardUrl(webAppUrl, executionId),
		summary: response,
	};
}

async function pollExecution(this: IExecuteFunctions, itemIndex: number): Promise<IDataObject> {
	const executionId = this.getNodeParameter('executionId', itemIndex) as string;
	const pollIntervalSec = this.getNodeParameter('pollIntervalSec', itemIndex, 8) as number;
	const pollTimeoutSec = this.getNodeParameter('pollTimeoutSec', itemIndex, 600) as number;
	const { webAppUrl } = await getTestNeoCredentials.call(this);

	const deadline = Date.now() + pollTimeoutSec * 1000;
	let lastSummary: IDataObject = {};
	let status = '';

	while (Date.now() < deadline) {
		lastSummary = await testNeoApiRequest.call(
			this,
			'GET',
			`/api/web/v1/analytics/execution/${executionId}/summary`,
		);
		status = pickStatus(asRecord(lastSummary));
		if (isTerminalStatus(status)) {
			break;
		}
		await sleepMs(pollIntervalSec * 1000);
	}

	if (!isTerminalStatus(status)) {
		throw new NodeOperationError(
			this.getNode(),
			`Execution ${executionId} did not reach a terminal status within ${pollTimeoutSec}s (last: ${status || 'unknown'})`,
			{ itemIndex },
		);
	}

	const passed = isPassStatus(status);
	return {
		operation: 'pollExecution',
		execution_id: executionId,
		status,
		terminal: true,
		passed,
		dashboard_url: dashboardUrl(webAppUrl, executionId),
		summary: lastSummary,
	};
}

async function postAgentVerification(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject> {
	const skipExecution = this.getNodeParameter('skipExecution', itemIndex, false) as boolean;
	const failOnBlock = this.getNodeParameter('failOnBlock', itemIndex, true) as boolean;
	const { webAppUrl } = await getTestNeoCredentials.call(this);

	const ingest = await ingestAgentRun.call(this, itemIndex);
	const semantic = await semanticAssert.call(this, itemIndex);
	const semanticPassed = Boolean(semantic.passed);

	let execute: IDataObject | null = null;
	let poll: IDataObject | null = null;
	let executionPass: boolean | null = null;
	let executionId: string | null = null;

	if (!skipExecution && semanticPassed) {
		execute = await executeTestCase.call(this, itemIndex);
		executionId = extractExecutionId(asRecord(execute));
		if (!executionId) {
			throw new NodeOperationError(
				this.getNode(),
				'Execute response did not include execution_id (check test_case_id / environment)',
				{ itemIndex },
			);
		}
		// Re-use poll params; temporarily set via getNodeParameter already available
		const pollIntervalSec = this.getNodeParameter('pollIntervalSec', itemIndex, 8) as number;
		const pollTimeoutSec = this.getNodeParameter('pollTimeoutSec', itemIndex, 600) as number;
		const deadline = Date.now() + pollTimeoutSec * 1000;
		let lastSummary: IDataObject = {};
		let status = '';
		while (Date.now() < deadline) {
			lastSummary = await testNeoApiRequest.call(
				this,
				'GET',
				`/api/web/v1/analytics/execution/${executionId}/summary`,
			);
			status = pickStatus(asRecord(lastSummary));
			if (isTerminalStatus(status)) {
				break;
			}
			await sleepMs(pollIntervalSec * 1000);
		}
		if (!isTerminalStatus(status)) {
			throw new NodeOperationError(
				this.getNode(),
				`Execution ${executionId} timed out after ${pollTimeoutSec}s`,
				{ itemIndex },
			);
		}
		executionPass = isPassStatus(status);
		poll = {
			execution_id: executionId,
			status,
			passed: executionPass,
			dashboard_url: dashboardUrl(webAppUrl, executionId),
			summary: lastSummary,
		};
	}

	const verdict = verdictFromParts({
		semanticPassed,
		executionPass,
		requireExecution: !skipExecution,
	});

	const result: IDataObject = {
		operation: 'postAgentVerification',
		verdict,
		contract_version: 'n8n_post_agent_verification.v1',
		ingest,
		semantic,
		execute,
		poll,
		dashboard_url: executionId ? dashboardUrl(webAppUrl, executionId) : null,
	};

	if (failOnBlock && verdict === 'BLOCK') {
		throw new NodeOperationError(this.getNode(), `TestNeo post-agent verification BLOCK`, {
			itemIndex,
			description: JSON.stringify({
				semantic_passed: semanticPassed,
				execution_passed: executionPass,
				execution_id: executionId,
			}),
		});
	}

	return result;
}

async function markDeployed(this: IExecuteFunctions, itemIndex: number): Promise<IDataObject> {
	const projectId = this.getNodeParameter('projectId', itemIndex) as number;
	const bundleId = this.getNodeParameter('bundleId', itemIndex) as string;
	const releaseName = this.getNodeParameter('releaseName', itemIndex, '') as string;
	const confidenceAtShip = this.getNodeParameter('confidenceAtShip', itemIndex, 0) as number;
	const gateStatusAtShip = this.getNodeParameter(
		'gateStatusAtShip',
		itemIndex,
		'GATE_PASS',
	) as string;

	const body: IDataObject = {
		project_id: projectId,
		bundle_id: bundleId,
		gate_status_at_ship: gateStatusAtShip,
	};
	if (releaseName) {
		body.release_name = releaseName;
	}
	if (confidenceAtShip > 0) {
		body.confidence_at_ship = confidenceAtShip;
	}

	const response = await testNeoApiRequest.call(
		this,
		'POST',
		'/api/web/v1/release-readiness/outcome',
		body,
	);

	return {
		operation: 'markDeployed',
		...response,
	};
}

async function listOutcomes(this: IExecuteFunctions, itemIndex: number): Promise<IDataObject> {
	const projectId = this.getNodeParameter('projectId', itemIndex) as number;
	const limit = this.getNodeParameter('limit', itemIndex, 50) as number;

	const response = await testNeoApiRequest.call(
		this,
		'GET',
		'/api/web/v1/release-readiness/outcomes',
		undefined,
		{ project_id: projectId, limit },
	);

	return {
		operation: 'listOutcomes',
		...response,
	};
}

async function recordOutcome(this: IExecuteFunctions, itemIndex: number): Promise<IDataObject> {
	const outcomeId = this.getNodeParameter('outcomeId', itemIndex) as string;
	const rollback = this.getNodeParameter('rollback', itemIndex, false) as boolean;
	const incidentWithin7d = this.getNodeParameter('incidentWithin7d', itemIndex, false) as boolean;
	const incidentWithin30d = this.getNodeParameter(
		'incidentWithin30d',
		itemIndex,
		false,
	) as boolean;
	const hotfixPrCount = this.getNodeParameter('hotfixPrCount', itemIndex, 0) as number;
	const outcomeNotes = this.getNodeParameter('outcomeNotes', itemIndex, '') as string;

	const body: IDataObject = {
		rollback,
		incident_within_7d: incidentWithin7d,
		incident_within_30d: incidentWithin30d,
		hotfix_pr_count: hotfixPrCount,
		outcome_notes: outcomeNotes,
	};

	const response = await testNeoApiRequest.call(
		this,
		'PATCH',
		`/api/web/v1/release-readiness/outcome/${outcomeId}`,
		body,
	);

	return {
		operation: 'recordOutcome',
		...response,
	};
}
