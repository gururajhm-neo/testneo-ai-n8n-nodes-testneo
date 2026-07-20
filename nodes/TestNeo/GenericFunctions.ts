import type {
	IExecuteFunctions,
	IHttpRequestOptions,
	IDataObject,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';

export type TestNeoCredentials = {
	apiKey: string;
	baseUrl: string;
	webAppUrl: string;
};

export async function getTestNeoCredentials(this: IExecuteFunctions): Promise<TestNeoCredentials> {
	const creds = (await this.getCredentials('testNeoApi')) as IDataObject;
	const baseUrl = String(creds.baseUrl || 'https://app.testneo.ai').replace(/\/+$/, '');
	const webAppUrl = String(creds.webAppUrl || baseUrl).replace(/\/+$/, '');
	const apiKey = String(creds.apiKey || '');
	if (!apiKey) {
		throw new NodeApiError(this.getNode(), { message: 'TestNeo API key is missing' } as JsonObject);
	}
	return { apiKey, baseUrl, webAppUrl };
}

/**
 * Authenticated JSON request against TestNeo REST (same contracts as examples/n8n).
 * Uses n8n helpers only — no runtime npm dependencies.
 */
export async function testNeoApiRequest(
	this: IExecuteFunctions,
	method: IHttpRequestOptions['method'],
	path: string,
	body?: IDataObject | IDataObject[],
	qs?: IDataObject,
): Promise<IDataObject> {
	const { baseUrl } = await getTestNeoCredentials.call(this);

	const options: IHttpRequestOptions = {
		method,
		url: `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`,
		qs,
		body,
		json: true,
		headers: {
			Accept: 'application/json',
			'Content-Type': 'application/json',
			'User-Agent': 'n8n-nodes-testneo/0.1.0',
		},
	};

	try {
		const response = await this.helpers.httpRequestWithAuthentication.call(
			this,
			'testNeoApi',
			options,
		);
		if (response === undefined || response === null || response === '') {
			return {};
		}
		if (typeof response === 'object') {
			return response as IDataObject;
		}
		return { data: response } as IDataObject;
	} catch (error) {
		throw new NodeApiError(this.getNode(), error as JsonObject);
	}
}

export function asRecord(value: unknown): Record<string, unknown> {
	if (value && typeof value === 'object' && !Array.isArray(value)) {
		return value as Record<string, unknown>;
	}
	return {};
}

export function parseJsonParam(value: unknown, fallback: IDataObject = {}): IDataObject {
	if (value === undefined || value === null || value === '') {
		return fallback;
	}
	if (typeof value === 'object' && !Array.isArray(value)) {
		return value as IDataObject;
	}
	if (typeof value === 'string') {
		const trimmed = value.trim();
		if (!trimmed) {
			return fallback;
		}
		return JSON.parse(trimmed) as IDataObject;
	}
	return fallback;
}
