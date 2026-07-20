import type {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
	Icon,
} from 'n8n-workflow';

/**
 * TestNeo API key credential.
 * Same auth as examples/n8n HTTP templates: Authorization: Bearer tn_…
 */
export class TestNeoApi implements ICredentialType {
	name = 'testNeoApi';

	displayName = 'TestNeo API';

	documentationUrl = 'https://testneo.ai/docs/n8n.html';

	icon: Icon = {
		light: 'file:../nodes/TestNeo/testneo.svg',
		dark: 'file:../nodes/TestNeo/testneo.dark.svg',
	};

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			placeholder: 'tn_…',
			description: 'From TestNeo → Settings → API Keys. Never commit this value.',
		},
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			default: 'https://app.testneo.ai',
			required: true,
			description:
				'Production: https://app.testneo.ai. Self-hosted API only for engineers (e.g. http://127.0.0.1:8001).',
		},
		{
			displayName: 'Web App URL',
			name: 'webAppUrl',
			type: 'string',
			default: 'https://app.testneo.ai',
			description: 'Used to build dashboard links (e.g. /test-runner/execution/…).',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiKey}}',
				Accept: 'application/json',
				'User-Agent': 'n8n-nodes-testneo/0.1.0',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.baseUrl}}',
			url: '/api/web/v1/projects',
			method: 'GET',
		},
	};
}
