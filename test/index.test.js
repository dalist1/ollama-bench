import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import http from 'node:http';
import test from 'node:test';
import { promisify } from 'node:util';

import { canonicalModelRef, modelRefMatches, parseArgs } from '../dist/index.js';

const execFileAsync = promisify(execFile);

test('parses current thinking levels and reproducibility options', () => {
  const options = parseArgs([
    '--think=max',
    '--runs=3',
    '--tokens',
    '128',
    '--seed=-7',
    '--keep-alive=10m',
    'qwen3',
    'qwen3',
  ]);

  assert.equal(options.think, 'max');
  assert.equal(options.runs, 3);
  assert.equal(options.numPredict, 128);
  assert.equal(options.seed, -7);
  assert.equal(options.keepAlive, '10m');
  assert.deepEqual(options.models, ['qwen3']);
});

test('uses model defaults unless thinking is explicitly configured', () => {
  const options = parseArgs(['gemma3:1b']);

  assert.equal(options.think, undefined);
  assert.equal(options.numPredict, 256);
  assert.equal(options.seed, 42);
});

test('rejects invalid and conflicting thinking options', () => {
  assert.throws(() => parseArgs(['--think=ultra', 'qwen3']), /--think must be/);
  assert.equal(parseArgs(['--think=false', 'qwen3']).noThink, true);
  assert.throws(() => parseArgs(['--think', '--no-think', 'qwen3']), /cannot be used together/);
});

test('normalizes Ollama latest tags without confusing registry ports', () => {
  assert.equal(canonicalModelRef('qwen3'), 'qwen3:latest');
  assert.equal(canonicalModelRef('team/qwen3'), 'team/qwen3:latest');
  assert.equal(canonicalModelRef('registry.example:5000/team/qwen3'), 'registry.example:5000/team/qwen3:latest');
  assert.equal(canonicalModelRef('qwen3:8b'), 'qwen3:8b');
  assert.equal(modelRefMatches('QWEN3', 'qwen3:latest'), true);
  assert.equal(modelRefMatches('qwen3:8b', 'qwen3:latest'), false);
});

test('uses the documented API shape and skips pulls for installed models', async (t) => {
  const requests = [];
  let generateBody;
  const server = http.createServer((request, response) => {
    requests.push(`${request.method} ${request.url}`);
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => {
      const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : undefined;

      if (request.url === '/api/version') {
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify({ version: 'test' }));
      } else if (request.url === '/api/tags') {
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify({
          models: [{
            name: 'qwen3:latest',
            model: 'qwen3:latest',
            size: 1000,
            details: { parameter_size: '1B', quantization_level: 'Q4_K_M' },
          }],
        }));
      } else if (request.url === '/api/generate') {
        generateBody = body;
        response.setHeader('content-type', 'application/x-ndjson');
        response.write(`${JSON.stringify({ response: 'Hi', done: false })}\n`);
        response.end(`${JSON.stringify({
          response: '',
          done: true,
          total_duration: 30_000_000,
          load_duration: 10_000_000,
          prompt_eval_count: 4,
          prompt_eval_duration: 5_000_000,
          eval_count: 2,
          eval_duration: 10_000_000,
        })}\n`);
      } else if (request.url === '/api/ps') {
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify({ models: [] }));
      } else {
        response.statusCode = 404;
        response.end();
      }
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const address = server.address();
  assert.notEqual(address, null);
  assert.equal(typeof address, 'object');

  const { stdout } = await execFileAsync(process.execPath, [
    'dist/index.js',
    '--json',
    '--think=max',
    '--tokens=32',
    '--seed=-7',
    '--host',
    `http://127.0.0.1:${address.port}`,
    'qwen3',
  ]);

  assert.equal(requests.includes('POST /api/pull'), false);
  assert.deepEqual(generateBody, {
    model: 'qwen3',
    prompt: 'Explain the theory of relativity in simple terms.',
    think: 'max',
    stream: true,
    keep_alive: '5m',
    options: { num_predict: 32, seed: -7 },
  });
  const output = JSON.parse(stdout);
  assert.equal(output.results[0].ok, true);
  assert.equal(output.results[0].tokensPerSecond, 200);
});
