/**
 * Pure helpers for execution polling — mirrored from examples/n8n/scripts/smoke_http.py
 * and CONTRACTS.md. No n8n runtime imports (unit-testable, zero deps).
 */

export const TERMINAL_STATUSES = new Set([
	'passed',
	'pass',
	'success',
	'successful',
	'completed',
	'complete',
	'failed',
	'fail',
	'error',
	'errored',
	'timed_out',
	'timeout',
	'cancelled',
	'canceled',
	'aborted',
	'terminated',
]);

export const PASS_STATUSES = new Set([
	'passed',
	'pass',
	'success',
	'successful',
	'completed',
	'complete',
]);

export function normalizeStatus(status: unknown): string {
	if (typeof status !== 'string') {
		return '';
	}
	return status.trim().toLowerCase();
}

export function isTerminalStatus(status: unknown): boolean {
	return TERMINAL_STATUSES.has(normalizeStatus(status));
}

export function isPassStatus(status: unknown): boolean {
	return PASS_STATUSES.has(normalizeStatus(status));
}

/**
 * Extract execution_id from execute-test response (top-level or under data).
 */
export function extractExecutionId(resp: Record<string, unknown> | null | undefined): string | null {
	if (!resp || typeof resp !== 'object') {
		return null;
	}
	const top = resp.execution_id;
	if (typeof top === 'string' && top.length >= 6) {
		return top;
	}
	const data = resp.data;
	if (data && typeof data === 'object' && !Array.isArray(data)) {
		const nested = (data as Record<string, unknown>).execution_id;
		if (typeof nested === 'string' && nested.length >= 6) {
			return nested;
		}
	}
	return null;
}

export function pickStatus(summary: Record<string, unknown> | null | undefined): string {
	if (!summary || typeof summary !== 'object') {
		return '';
	}
	for (const key of ['status', 'execution_status', 'result_status', 'state']) {
		const val = summary[key];
		if (typeof val === 'string' && val.trim()) {
			return val;
		}
	}
	const data = summary.data;
	if (data && typeof data === 'object' && !Array.isArray(data)) {
		const nested = (data as Record<string, unknown>).status;
		if (typeof nested === 'string' && nested.trim()) {
			return nested;
		}
	}
	return '';
}

export function dashboardUrl(webAppUrl: string, executionId: string): string {
	const base = webAppUrl.replace(/\/+$/, '');
	return `${base}/test-runner/execution/${executionId}`;
}

export function sleepMs(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export type VerificationVerdict = 'PASS' | 'BLOCK';

export function verdictFromParts(opts: {
	semanticPassed: boolean;
	executionPass: boolean | null;
	requireExecution: boolean;
}): VerificationVerdict {
	if (!opts.semanticPassed) {
		return 'BLOCK';
	}
	if (opts.requireExecution && opts.executionPass !== true) {
		return 'BLOCK';
	}
	return 'PASS';
}
