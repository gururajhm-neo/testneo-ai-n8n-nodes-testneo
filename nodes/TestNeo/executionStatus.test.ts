import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
	dashboardUrl,
	extractExecutionId,
	isPassStatus,
	isTerminalStatus,
	normalizeStatus,
	pickStatus,
	verdictFromParts,
} from './executionStatus';

describe('executionStatus', () => {
	it('normalizes status case', () => {
		assert.equal(normalizeStatus('PASSED'), 'passed');
		assert.equal(normalizeStatus('  Fail  '), 'fail');
		assert.equal(normalizeStatus(null), '');
	});

	it('recognizes terminal and pass sets from CONTRACTS.md', () => {
		assert.equal(isTerminalStatus('passed'), true);
		assert.equal(isTerminalStatus('timed_out'), true);
		assert.equal(isTerminalStatus('cancelled'), true);
		assert.equal(isTerminalStatus('running'), false);

		assert.equal(isPassStatus('success'), true);
		assert.equal(isPassStatus('completed'), true);
		assert.equal(isPassStatus('failed'), false);
		assert.equal(isPassStatus('error'), false);
	});

	it('extracts execution_id from top-level or data', () => {
		assert.equal(extractExecutionId({ execution_id: 'abc12345' }), 'abc12345');
		assert.equal(
			extractExecutionId({ data: { execution_id: 'xyz98765' } }),
			'xyz98765',
		);
		assert.equal(extractExecutionId({ execution_id: 'short' }), null);
		assert.equal(extractExecutionId({}), null);
	});

	it('picks status from common keys', () => {
		assert.equal(pickStatus({ status: 'passed' }), 'passed');
		assert.equal(pickStatus({ execution_status: 'failed' }), 'failed');
		assert.equal(pickStatus({ data: { status: 'success' } }), 'success');
		assert.equal(pickStatus({}), '');
	});

	it('builds dashboard URL', () => {
		assert.equal(
			dashboardUrl('https://app.testneo.ai/', 'exec-1'),
			'https://app.testneo.ai/test-runner/execution/exec-1',
		);
	});

	it('computes PASS/BLOCK verdict', () => {
		assert.equal(
			verdictFromParts({ semanticPassed: true, executionPass: true, requireExecution: true }),
			'PASS',
		);
		assert.equal(
			verdictFromParts({ semanticPassed: false, executionPass: true, requireExecution: true }),
			'BLOCK',
		);
		assert.equal(
			verdictFromParts({ semanticPassed: true, executionPass: false, requireExecution: true }),
			'BLOCK',
		);
		assert.equal(
			verdictFromParts({ semanticPassed: true, executionPass: null, requireExecution: false }),
			'PASS',
		);
	});
});
