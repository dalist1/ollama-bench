#!/usr/bin/env node
import { Ollama, } from 'ollama';
/**
 * Object containing ANSI color codes for text coloring.
 */
const codes = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    cyan: '\x1b[36m',
    magenta: '\x1b[35m',
    blue: '\x1b[34m',
    gray: '\x1b[90m',
    bold: '\x1b[1m',
};
/**
 * Whether the current stdout is an interactive terminal (controls spinners).
 */
const isTTY = process.stdout.isTTY === true;
/**
 * Whether ANSI colors should be emitted. Honors NO_COLOR / FORCE_COLOR and TTY.
 */
const useColor = !('NO_COLOR' in process.env) &&
    process.env.TERM !== 'dumb' &&
    (isTTY || 'FORCE_COLOR' in process.env);
/**
 * Applies color to the given text (no-op when colors are disabled).
 * @param text - The text to colorize.
 * @param color - The color to apply.
 * @returns The colorized text.
 */
function colorize(text, color) {
    return useColor ? `${codes[color]}${text}${codes.reset}` : text;
}
/* -------------------------------------------------------------------------- */
/*  Formatting helpers                                                        */
/* -------------------------------------------------------------------------- */
/**
 * Formats a duration in seconds into a compact human-readable string.
 */
function fmtDuration(seconds) {
    if (!isFinite(seconds) || seconds < 0)
        return '—';
    if (seconds < 1)
        return `${(seconds * 1000).toFixed(0)}ms`;
    if (seconds < 60)
        return `${seconds.toFixed(2)}s`;
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}m${s.toFixed(0)}s`;
}
/**
 * Formats a byte count into a human-readable string (GB / MB / KB).
 */
function fmtBytes(bytes) {
    if (!bytes || bytes <= 0)
        return '—';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let v = bytes;
    let i = 0;
    while (v >= 1024 && i < units.length - 1) {
        v /= 1024;
        i++;
    }
    return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)}${units[i]}`;
}
/**
 * Formats a tokens-per-second value.
 */
function fmtRate(rate) {
    if (!isFinite(rate) || rate <= 0)
        return '—';
    return `${rate.toFixed(1)} t/s`;
}
/* -------------------------------------------------------------------------- */
/*  Spinner                                                                   */
/* -------------------------------------------------------------------------- */
/**
 * A minimal TTY spinner. On non-interactive terminals it prints a single line
 * and becomes a no-op, so piped/CI output stays clean.
 */
class Spinner {
    static get tty() {
        return process.stderr.isTTY === true;
    }
    constructor(text) {
        this.text = text;
        this.frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
        this.timer = null;
        this.i = 0;
    }
    start() {
        // Progress goes to stderr so stdout stays clean for reports / --json.
        if (!Spinner.tty) {
            process.stderr.write(`${this.text}\n`);
            return this;
        }
        this.timer = setInterval(() => {
            const frame = colorize(this.frames[this.i], 'cyan');
            process.stderr.write(`\r${frame} ${this.text}\x1b[K`);
            this.i = (this.i + 1) % this.frames.length;
        }, 80);
        return this;
    }
    update(text) {
        this.text = text;
    }
    stop() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
        if (Spinner.tty)
            process.stderr.write('\r\x1b[K');
    }
}
const DEFAULT_PROMPT = 'Explain the theory of relativity in simple terms.';
const TOOL_VERSION = '1.3.0';
const THINK_LEVELS = new Set(['low', 'medium', 'high', 'max']);
/* -------------------------------------------------------------------------- */
/*  Argument parsing                                                          */
/* -------------------------------------------------------------------------- */
/**
 * Parses process.argv into structured CLI options.
 */
export function parseArgs(argv) {
    const opts = {
        models: [],
        prompt: DEFAULT_PROMPT,
        runs: 1,
        think: undefined,
        noThink: false,
        forcePull: false,
        numPredict: 256,
        seed: 42,
        keepAlive: '5m',
        json: false,
        demo: false,
        help: false,
        version: false,
    };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        const next = (option) => {
            const value = argv[++i];
            if (value === undefined)
                throw new Error(`${option} requires a value`);
            return value;
        };
        const positiveInt = (value, option) => {
            if (!/^\d+$/.test(value) || Number(value) < 1 || !Number.isSafeInteger(Number(value))) {
                throw new Error(`${option} must be a positive integer`);
            }
            return Number(value);
        };
        const integer = (value, option) => {
            if (!/^-?\d+$/.test(value) || !Number.isSafeInteger(Number(value))) {
                throw new Error(`${option} must be an integer`);
            }
            return Number(value);
        };
        if (arg === '-h' || arg === '--help')
            opts.help = true;
        else if (arg === '-v' || arg === '--version')
            opts.version = true;
        else if (arg === '--json')
            opts.json = true;
        else if (arg === '--demo')
            opts.demo = true;
        else if (arg === '--pull')
            opts.forcePull = true;
        else if (arg === '--no-think')
            opts.noThink = true;
        else if (arg === '--think')
            opts.think = true;
        else if (arg.startsWith('--think=')) {
            const level = arg.slice('--think='.length);
            if (level === 'true')
                opts.think = true;
            else if (level === 'false')
                opts.noThink = true;
            else if (THINK_LEVELS.has(level))
                opts.think = level;
            else
                throw new Error('--think must be true, false, low, medium, high, or max');
        }
        else if (arg === '--prompt')
            opts.prompt = next(arg);
        else if (arg.startsWith('--prompt='))
            opts.prompt = arg.slice('--prompt='.length);
        else if (arg === '--runs')
            opts.runs = positiveInt(next(arg), arg);
        else if (arg.startsWith('--runs='))
            opts.runs = positiveInt(arg.slice('--runs='.length), '--runs');
        else if (arg === '--tokens')
            opts.numPredict = positiveInt(next(arg), arg);
        else if (arg.startsWith('--tokens='))
            opts.numPredict = positiveInt(arg.slice('--tokens='.length), '--tokens');
        else if (arg === '--seed')
            opts.seed = integer(next(arg), arg);
        else if (arg.startsWith('--seed='))
            opts.seed = integer(arg.slice('--seed='.length), '--seed');
        else if (arg === '--keep-alive')
            opts.keepAlive = next(arg);
        else if (arg.startsWith('--keep-alive='))
            opts.keepAlive = arg.slice('--keep-alive='.length);
        else if (arg === '--host')
            opts.host = next(arg);
        else if (arg.startsWith('--host='))
            opts.host = arg.slice('--host='.length);
        else if (arg.startsWith('-'))
            throw new Error(`Unknown option: ${arg}`);
        else if (!opts.models.includes(arg))
            opts.models.push(arg);
    }
    if (opts.noThink && opts.think !== undefined) {
        throw new Error('--think and --no-think cannot be used together');
    }
    if (!opts.keepAlive)
        throw new Error('--keep-alive cannot be empty');
    return opts;
}
/**
 * Prints CLI usage / help text.
 */
function printHelp() {
    const b = (t) => colorize(t, 'bold');
    const c = (t) => colorize(t, 'cyan');
    console.log(`
${b('ollama-bench')} — benchmark Ollama models with phase-by-phase analysis

${b('USAGE')}
  ollama-bench [options] <model> [model...]

${b('OPTIONS')}
  ${c('--think[=low|medium|high|max]')} Set thinking or effort (model default if omitted)
  ${c('--no-think')}                 Disable thinking even for reasoning models
  ${c('--prompt <text>')}            Custom benchmark prompt
  ${c('--runs <n>')}                 Repeat each model n times and average (default: 1)
  ${c('--tokens <n>')}               Maximum output tokens per run (default: 256)
  ${c('--seed <n>')}                 Generation seed for repeatability (default: 42)
  ${c('--keep-alive <duration>')}     Keep models loaded between runs (default: 5m)
  ${c('--pull')}                     Refresh models even when already installed
  ${c('--host <url>')}               Server URL (default: OLLAMA_HOST or localhost:11434)
  ${c('--json')}                     Emit machine-readable JSON instead of the report
  ${c('--demo')}                     Render the UI with synthetic data (no server needed)
  ${c('-v, --version')}              Print version
  ${c('-h, --help')}                 Show this help

${b('EXAMPLES')}
  ollama-bench qwen3:0.6b llama3.2:1b
  ollama-bench --runs 3 --think=high deepseek-r1:1.5b
  ollama-bench --prompt "Write a haiku about TCP" --json gemma3:1b
`);
}
/* -------------------------------------------------------------------------- */
/*  Ollama interactions                                                       */
/* -------------------------------------------------------------------------- */
/** Verifies that the configured Ollama API is reachable. */
async function ensureServer(client, directCloud) {
    try {
        const { version } = await client.version();
        return version;
    }
    catch {
        if (directCloud) {
            throw new Error('Could not reach the ollama.com API; check OLLAMA_API_KEY and your network');
        }
        throw new Error('Could not reach the Ollama server; start it with: ollama serve');
    }
}
/** Normalizes an omitted model tag to Ollama's documented `latest` default. */
export function canonicalModelRef(model) {
    const lastSlash = model.lastIndexOf('/');
    return model.lastIndexOf(':') > lastSlash ? model : `${model}:latest`;
}
/** Matches user model references against names returned by list/ps. */
export function modelRefMatches(requested, candidate) {
    return canonicalModelRef(requested).toLowerCase() === canonicalModelRef(candidate).toLowerCase();
}
function findModel(models, requested) {
    return models.find((model) => modelRefMatches(requested, model.name) || modelRefMatches(requested, model.model));
}
/**
 * Pulls a model, rendering a live progress bar with percentage.
 */
async function pullModel(client, model) {
    const spinner = new Spinner(colorize(`Pulling ${model}…`, 'blue')).start();
    const start = performance.now();
    try {
        const stream = await client.pull({ model, stream: true });
        for await (const part of stream) {
            if (part.total && part.completed) {
                const pct = Math.min(100, (part.completed / part.total) * 100);
                const width = 24;
                const filled = Math.round((pct / 100) * width);
                const bar = '█'.repeat(filled) + '░'.repeat(width - filled);
                spinner.update(`${colorize(`Pulling ${model}`, 'blue')} ${colorize(bar, 'cyan')} ` +
                    `${pct.toFixed(0)}%  ${colorize(`${fmtBytes(part.completed)}/${fmtBytes(part.total)}`, 'gray')}`);
            }
            else {
                spinner.update(colorize(`Pulling ${model} — ${part.status}…`, 'blue'));
            }
        }
        spinner.stop();
        const elapsed = (performance.now() - start) / 1000;
        console.error(colorize(`✓ ${model} ready ${colorize(`(${fmtDuration(elapsed)})`, 'gray')}`, 'green'));
        return true;
    }
    catch (error) {
        spinner.stop();
        console.error(colorize(`✗ Failed to pull ${model}: ${error.message}`, 'red'));
        return false;
    }
}
/** Pulls only models that are missing, unless an explicit refresh was requested. */
async function prepareModels(client, models, forcePull, directCloud) {
    const prepared = new Map();
    // The direct ollama.com API runs cloud models without a local pull step.
    if (directCloud) {
        for (const model of models)
            prepared.set(model, { ready: true });
        return prepared;
    }
    let installed = [];
    try {
        installed = (await client.list()).models;
    }
    catch {
        // Pulling is the safe fallback for older or API-compatible custom servers.
        forcePull = true;
    }
    for (const model of models) {
        const local = findModel(installed, model);
        if (local && !forcePull) {
            prepared.set(model, { ready: true, local });
            continue;
        }
        const ready = await pullModel(client, model);
        prepared.set(model, {
            ready,
            local,
            error: ready ? undefined : `failed to pull model '${model}'`,
        });
    }
    return prepared;
}
/**
 * Computes a finite rate, avoiding Infinity/NaN in JSON output.
 */
function rate(count, seconds) {
    return seconds > 0 ? count / seconds : 0;
}
/**
 * Runs a single streamed generation and captures timing samples.
 */
async function runOnce(client, model, prompt, think, numPredict, seed, keepAlive) {
    const start = performance.now();
    let firstTokenAt = 0;
    let firstResponseAt = 0;
    let thinkStartAt = 0;
    let thinkingChars = 0;
    let final;
    // The current API supports `max`; ollama-js 0.6.3's declaration has not
    // caught up yet, hence the narrow compatibility cast at this boundary.
    const request = {
        model,
        prompt,
        think,
        stream: true,
        keep_alive: keepAlive,
        options: { num_predict: numPredict, seed },
    };
    const stream = await client.generate(request);
    for await (const chunk of stream) {
        const now = performance.now();
        if (chunk.thinking) {
            if (!thinkStartAt)
                thinkStartAt = now;
            thinkingChars += chunk.thinking.length;
        }
        if (chunk.response && !firstResponseAt)
            firstResponseAt = now;
        if ((chunk.response || chunk.thinking) && !firstTokenAt)
            firstTokenAt = now;
        if (chunk.done)
            final = chunk;
    }
    if (!final)
        throw new Error('No response received from server');
    const end = performance.now();
    return {
        loadTime: (final.load_duration ?? 0) / 1e9,
        promptEvalTime: (final.prompt_eval_duration ?? 0) / 1e9,
        promptEvalCount: final.prompt_eval_count ?? 0,
        generationTime: (final.eval_duration ?? 0) / 1e9,
        evalCount: final.eval_count ?? 0,
        totalTime: (final.total_duration ?? 0) / 1e9,
        ttft: firstTokenAt ? (firstTokenAt - start) / 1000 : 0,
        timeToFirstResponse: firstResponseAt ? (firstResponseAt - start) / 1000 : 0,
        wallTime: (end - start) / 1000,
        thinkingChars,
        // Thinking precedes response chunks in Ollama's documented stream shape.
        thinkingWallTime: thinkStartAt ? ((firstResponseAt || end) - thinkStartAt) / 1000 : 0,
    };
}
/**
 * Benchmarks a model across one or more runs and aggregates the results.
 */
function failedBenchmark(model, error) {
    return {
        model,
        ok: false,
        error,
        runs: 0,
        loadTime: 0,
        promptEvalTime: 0,
        promptEvalCount: 0,
        promptTokensPerSecond: 0,
        generationTime: 0,
        evalCount: 0,
        tokensPerSecond: 0,
        totalTime: 0,
        ttft: 0,
        timeToFirstResponse: 0,
        wallTime: 0,
        thinking: false,
        thinkingTime: 0,
        thinkingChars: 0,
        thinkingCharsPerSecond: 0,
    };
}
async function benchmarkModel(client, model, opts, local) {
    // Omitting `think` uses Ollama's documented model default. This is faster
    // than a show() capability probe and works for GPT-OSS, where true is ignored.
    const think = opts.noThink ? false : opts.think;
    const thinkLabel = typeof think === 'string' ? `think=${think}` : 'thinking';
    const label = think ? `${model} ${colorize(`(${thinkLabel})`, 'magenta')}` : model;
    const spinner = new Spinner(colorize(`Benchmarking ${label}…`, 'blue')).start();
    const samples = [];
    try {
        for (let r = 0; r < opts.runs; r++) {
            if (opts.runs > 1)
                spinner.update(colorize(`Benchmarking ${label} — run ${r + 1}/${opts.runs}…`, 'blue'));
            samples.push(await runOnce(client, model, opts.prompt, think, opts.numPredict, opts.seed, opts.keepAlive));
        }
        spinner.stop();
    }
    catch (error) {
        spinner.stop();
        return failedBenchmark(model, error.message);
    }
    // Average across runs.
    const avg = (pick) => samples.reduce((a, s) => a + pick(s), 0) / samples.length;
    const loadTime = avg((s) => s.loadTime);
    const promptEvalTime = avg((s) => s.promptEvalTime);
    const promptEvalCount = avg((s) => s.promptEvalCount);
    const generationTime = avg((s) => s.generationTime);
    const evalCount = avg((s) => s.evalCount);
    const totalTime = avg((s) => s.totalTime);
    const thinkingChars = avg((s) => s.thinkingChars);
    const thinkingWallTime = avg((s) => s.thinkingWallTime);
    // Pull resource usage for the (still-loaded) model.
    let sizeBytes = local?.size;
    let sizeVramBytes;
    let parameterSize = local?.details?.parameter_size;
    let quantization = local?.details?.quantization_level;
    let contextLength;
    try {
        const { models } = await client.ps();
        const live = models.find((running) => modelRefMatches(model, running.name) || modelRefMatches(model, running.model));
        if (live) {
            sizeBytes = live.size;
            sizeVramBytes = live.size_vram;
            parameterSize = live.details?.parameter_size;
            quantization = live.details?.quantization_level;
            contextLength = live.context_length;
        }
    }
    catch {
        /* ps() is best-effort */
    }
    return {
        model,
        ok: true,
        runs: samples.length,
        loadTime,
        promptEvalTime,
        promptEvalCount,
        promptTokensPerSecond: rate(promptEvalCount, promptEvalTime),
        generationTime,
        evalCount,
        tokensPerSecond: rate(evalCount, generationTime),
        totalTime,
        ttft: avg((s) => s.ttft),
        timeToFirstResponse: avg((s) => s.timeToFirstResponse),
        wallTime: avg((s) => s.wallTime),
        thinking: thinkingChars > 0,
        thinkingTime: thinkingWallTime,
        thinkingChars,
        // Ollama does not expose a separate token count for thinking chunks, so report
        // the exact streamed character rate instead of estimating tokens from chars.
        thinkingCharsPerSecond: rate(thinkingChars, thinkingWallTime),
        sizeBytes,
        sizeVramBytes,
        parameterSize,
        quantization,
        contextLength,
    };
}
/* -------------------------------------------------------------------------- */
/*  Rendering                                                                 */
/* -------------------------------------------------------------------------- */
/**
 * Renders the detailed per-phase breakdown for a single result.
 */
function renderResult(r) {
    const runsNote = r.runs > 1 ? colorize(`  (avg of ${r.runs} runs)`, 'gray') : '';
    console.log(colorize(`\n${r.model}`, 'cyan') + runsNote);
    console.log(colorize('─'.repeat(52), 'gray'));
    if (!r.ok) {
        console.log(colorize(`  ✗ ${r.error}`, 'red'));
        return;
    }
    const pct = (t) => (r.totalTime > 0 ? `${((t / r.totalTime) * 100).toFixed(0)}%` : '—');
    const line = (label, value, note = '') => console.log(`  ${label.padEnd(22)} ${colorize(value, 'bold')}  ${colorize(note, 'gray')}`);
    if (r.sizeBytes || r.parameterSize) {
        let placement;
        if (r.sizeVramBytes === 0)
            placement = 'CPU';
        else if (r.sizeVramBytes && r.sizeBytes) {
            const gpuPercent = Math.min(100, (r.sizeVramBytes / r.sizeBytes) * 100);
            placement = gpuPercent >= 99.5 ? 'GPU' : `${gpuPercent.toFixed(0)}% GPU`;
        }
        else if (r.sizeVramBytes)
            placement = 'GPU';
        const detail = [
            r.parameterSize,
            r.quantization,
            r.sizeBytes ? fmtBytes(r.sizeBytes) : undefined,
            r.contextLength ? `${r.contextLength.toLocaleString()} ctx` : undefined,
            r.sizeVramBytes ? `${fmtBytes(r.sizeVramBytes)} VRAM` : undefined,
            placement,
        ]
            .filter(Boolean)
            .join(' · ');
        console.log('  ' + colorize(detail, 'gray'));
        console.log();
    }
    line('Load', fmtDuration(r.loadTime), pct(r.loadTime) + ' of total');
    line('Prompt eval', fmtDuration(r.promptEvalTime), `${Math.round(r.promptEvalCount)} tok · ${fmtRate(r.promptTokensPerSecond)}`);
    line('First token (TTFT)', fmtDuration(r.ttft));
    if (r.thinking) {
        line('Thinking', fmtDuration(r.thinkingTime), `${Math.round(r.thinkingChars)} chars · ${r.thinkingCharsPerSecond.toFixed(1)} chars/s`);
        line('First answer token', r.timeToFirstResponse > 0 ? fmtDuration(r.timeToFirstResponse) : '—');
    }
    line('Output eval', fmtDuration(r.generationTime), `${Math.round(r.evalCount)} tok · ${pct(r.generationTime)} of total`);
    console.log();
    line(colorize('Speed', 'green'), colorize(fmtRate(r.tokensPerSecond), 'green'), colorize(`server ${fmtDuration(r.totalTime)} · wall ${fmtDuration(r.wallTime)}`, 'gray'));
}
/**
 * Renders an aligned comparison table ranking models by generation speed.
 */
function renderTable(results) {
    const ok = results.filter((r) => r.ok);
    if (ok.length === 0)
        return;
    const ranked = [...ok].sort((a, b) => b.tokensPerSecond - a.tokensPerSecond);
    const best = ranked[0];
    const headers = ['', 'Model', 'Params', 'Gen', 'Prompt', 'TTFT', 'Load', 'Total'];
    const rows = ranked.map((r, i) => ({
        '': i === 0 ? '★' : `${i + 1}`,
        Model: r.model + (r.thinking ? ' ◇' : ''),
        Params: r.parameterSize ?? '—',
        Gen: fmtRate(r.tokensPerSecond),
        Prompt: fmtRate(r.promptTokensPerSecond),
        TTFT: fmtDuration(r.ttft),
        Load: fmtDuration(r.loadTime),
        Total: fmtDuration(r.totalTime),
    }));
    const widths = headers.map((h) => Math.max(h.length, ...rows.map((row) => row[h].length)));
    const fmtRow = (cells) => cells.map((c, i) => (i <= 1 ? c.padEnd(widths[i]) : c.padStart(widths[i]))).join('  ');
    console.log(colorize('\nRanking', 'magenta'));
    console.log(colorize('═'.repeat(52), 'magenta'));
    console.log(colorize(fmtRow(headers), 'bold'));
    console.log(colorize(headers.map((_, i) => '─'.repeat(widths[i])).join('  '), 'gray'));
    ranked.forEach((r, i) => {
        const cells = fmtRow(headers.map((h) => rows[i][h]));
        console.log(i === 0 ? colorize(cells, 'green') : cells);
    });
    if (ranked.some((r) => r.thinking)) {
        console.log(colorize('\n◇ reasoning model (thinking enabled)', 'gray'));
    }
    console.log(colorize(`\nFastest: ${best.model} at ${fmtRate(best.tokensPerSecond)}`, 'magenta'));
}
/* -------------------------------------------------------------------------- */
/*  Demo data (for UI testing without a server)                              */
/* -------------------------------------------------------------------------- */
/**
 * Produces synthetic benchmark results so the UI can be previewed/tested
 * without a running Ollama server.
 */
function demoResults() {
    return [
        {
            model: 'qwen3:0.6b',
            ok: true,
            runs: 1,
            loadTime: 0.42,
            promptEvalTime: 0.08,
            promptEvalCount: 14,
            promptTokensPerSecond: 175,
            generationTime: 1.9,
            evalCount: 320,
            tokensPerSecond: 168.4,
            totalTime: 2.4,
            ttft: 0.51,
            timeToFirstResponse: 1.64,
            wallTime: 2.43,
            thinking: true,
            thinkingTime: 1.13,
            thinkingChars: 640,
            thinkingCharsPerSecond: 568,
            sizeBytes: 1.3e9,
            sizeVramBytes: 1.3e9,
            parameterSize: '0.6B',
            quantization: 'Q4_K_M',
        },
        {
            model: 'llama3.2:1b',
            ok: true,
            runs: 1,
            loadTime: 0.6,
            promptEvalTime: 0.05,
            promptEvalCount: 12,
            promptTokensPerSecond: 240,
            generationTime: 2.4,
            evalCount: 280,
            tokensPerSecond: 116.7,
            totalTime: 3.05,
            ttft: 0.66,
            timeToFirstResponse: 0.66,
            wallTime: 3.08,
            thinking: false,
            thinkingTime: 0,
            thinkingChars: 0,
            thinkingCharsPerSecond: 0,
            sizeBytes: 1.9e9,
            sizeVramBytes: 0,
            parameterSize: '1.2B',
            quantization: 'Q8_0',
        },
        {
            model: 'gemma3:1b',
            ok: false,
            error: "model 'gemma3:1b' not found",
            runs: 0,
            loadTime: 0,
            promptEvalTime: 0,
            promptEvalCount: 0,
            promptTokensPerSecond: 0,
            generationTime: 0,
            evalCount: 0,
            tokensPerSecond: 0,
            totalTime: 0,
            ttft: 0,
            timeToFirstResponse: 0,
            wallTime: 0,
            thinking: false,
            thinkingTime: 0,
            thinkingChars: 0,
            thinkingCharsPerSecond: 0,
        },
    ];
}
/* -------------------------------------------------------------------------- */
/*  Main                                                                      */
/* -------------------------------------------------------------------------- */
function isDirectCloudHost(host) {
    if (!host)
        return false;
    try {
        const url = new URL(/^https?:\/\//i.test(host) ? host : `http://${host}`);
        return url.hostname.toLowerCase() === 'ollama.com';
    }
    catch {
        return false;
    }
}
/**
 * Orchestrates argument parsing, model preparation, benchmarking and output.
 */
export async function main(argv = process.argv.slice(2)) {
    const opts = parseArgs(argv);
    if (opts.help)
        return printHelp();
    if (opts.version) {
        console.log(TOOL_VERSION);
        return;
    }
    // Demo mode: render the UI from synthetic data, no server required.
    if (opts.demo) {
        const results = demoResults();
        console.log(colorize('ollama-bench (demo)', 'cyan'));
        console.log(colorize('═'.repeat(52), 'cyan'));
        results.forEach(renderResult);
        renderTable(results);
        return;
    }
    if (opts.models.length === 0) {
        console.error(colorize('Error: specify at least one model.\n', 'red'));
        printHelp();
        process.exit(1);
    }
    const host = opts.host ?? process.env.OLLAMA_HOST;
    const directCloud = isDirectCloudHost(host);
    const apiKey = directCloud ? process.env.OLLAMA_API_KEY : undefined;
    if (directCloud && !apiKey) {
        throw new Error('OLLAMA_API_KEY is required when connecting directly to ollama.com');
    }
    const client = new Ollama({
        ...(host ? { host } : {}),
        ...(apiKey ? { headers: { Authorization: `Bearer ${apiKey}` } } : {}),
    });
    const serverVersion = await ensureServer(client, directCloud);
    if (!opts.json) {
        console.log(colorize('ollama-bench', 'cyan') + colorize(`  ·  server v${serverVersion}`, 'gray'));
        console.log(colorize('═'.repeat(52), 'cyan'));
        console.log(colorize('\nPreparing models', 'cyan'));
        console.log(colorize('─'.repeat(52), 'gray'));
    }
    const prepared = await prepareModels(client, opts.models, opts.forcePull, directCloud);
    if (!opts.json) {
        for (const model of opts.models) {
            const state = prepared.get(model);
            if (directCloud)
                console.log(colorize(`  ✓ ${model} via ollama.com`, 'green'));
            else if (state?.local && !opts.forcePull)
                console.log(colorize(`  ✓ ${model} already installed`, 'green'));
            else if (!state?.ready)
                console.log(colorize(`  ✗ ${model} unavailable`, 'red'));
        }
    }
    if (!opts.json) {
        console.log(colorize('\nBenchmarking', 'cyan'));
        console.log(colorize('─'.repeat(52), 'gray'));
    }
    const results = [];
    for (const model of opts.models) {
        const state = prepared.get(model);
        const result = state?.ready
            ? await benchmarkModel(client, model, opts, state.local)
            : failedBenchmark(model, state?.error ?? `model '${model}' is unavailable`);
        results.push(result);
        if (!opts.json)
            renderResult(result);
    }
    if (opts.json) {
        console.log(JSON.stringify({
            server: serverVersion,
            prompt: opts.prompt,
            settings: {
                runs: opts.runs,
                numPredict: opts.numPredict,
                seed: opts.seed,
                think: opts.noThink ? false : (opts.think ?? 'model-default'),
                keepAlive: opts.keepAlive,
            },
            results,
        }, null, 2));
    }
    else if (results.filter((r) => r.ok).length > 1) {
        renderTable(results);
    }
    // Non-zero exit if every model failed.
    if (results.every((r) => !r.ok))
        process.exit(1);
}
if (import.meta.url === import.meta.resolve(process.argv[1])) {
    main().catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        console.error(colorize(`Error: ${message}`, 'red'));
        process.exit(1);
    });
}
