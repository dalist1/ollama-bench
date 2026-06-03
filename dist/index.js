#!/usr/bin/env node
import { Ollama } from 'ollama';
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
const TOOL_VERSION = '1.2.0';
/* -------------------------------------------------------------------------- */
/*  Argument parsing                                                          */
/* -------------------------------------------------------------------------- */
/**
 * Parses process.argv into structured CLI options.
 */
function parseArgs(argv) {
    const opts = {
        models: [],
        prompt: DEFAULT_PROMPT,
        runs: 1,
        think: undefined,
        noThink: false,
        json: false,
        demo: false,
        help: false,
        version: false,
    };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        const next = () => argv[++i];
        if (arg === '-h' || arg === '--help')
            opts.help = true;
        else if (arg === '-v' || arg === '--version')
            opts.version = true;
        else if (arg === '--json')
            opts.json = true;
        else if (arg === '--demo')
            opts.demo = true;
        else if (arg === '--no-think')
            opts.noThink = true;
        else if (arg === '--think')
            opts.think = true;
        else if (arg.startsWith('--think=')) {
            const level = arg.slice('--think='.length);
            opts.think = level === 'true' ? true : level;
        }
        else if (arg === '--prompt')
            opts.prompt = next() ?? opts.prompt;
        else if (arg.startsWith('--prompt='))
            opts.prompt = arg.slice('--prompt='.length);
        else if (arg === '--runs')
            opts.runs = Math.max(1, parseInt(next() ?? '1', 10) || 1);
        else if (arg.startsWith('--runs='))
            opts.runs = Math.max(1, parseInt(arg.slice('--runs='.length), 10) || 1);
        else if (arg === '--host')
            opts.host = next();
        else if (arg.startsWith('--host='))
            opts.host = arg.slice('--host='.length);
        else if (arg.startsWith('-')) {
            console.error(colorize(`Unknown option: ${arg}`, 'red'));
            process.exit(1);
        }
        else
            opts.models.push(arg);
    }
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
  ${c('--think[=high|medium|low]')}  Enable reasoning/thinking (auto-detected by default)
  ${c('--no-think')}                 Disable thinking even for reasoning models
  ${c('--prompt <text>')}            Custom benchmark prompt
  ${c('--runs <n>')}                 Repeat each model n times and average (default: 1)
  ${c('--host <url>')}               Ollama server URL (default: http://127.0.0.1:11434)
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
/**
 * Verifies the Ollama server is reachable, returning its version.
 * Exits with a friendly message when the server is unreachable.
 */
async function ensureServer(client) {
    try {
        const { version } = await client.version();
        return version;
    }
    catch {
        console.error(colorize('✗ Could not reach the Ollama server.', 'red'));
        console.error(colorize('  Is it running?  Start it with:  ollama serve', 'gray'));
        process.exit(1);
    }
}
/**
 * Returns the capability list for a model (e.g. ['completion', 'thinking', 'tools']).
 * Returns an empty array if the model is not present locally.
 */
async function modelCapabilities(client, model) {
    try {
        const info = await client.show({ model });
        return info.capabilities ?? [];
    }
    catch {
        return [];
    }
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
/**
 * Computes a finite rate, avoiding Infinity/NaN in JSON output.
 */
function rate(count, seconds) {
    return seconds > 0 ? count / seconds : 0;
}
/**
 * Runs a single streamed generation and captures timing samples.
 */
async function runOnce(client, model, prompt, think) {
    const start = performance.now();
    let firstTokenAt = 0;
    let thinkStartAt = 0;
    let thinkEndAt = 0;
    let thinkingChars = 0;
    let final;
    const stream = await client.generate({
        model,
        prompt,
        // Pass false explicitly so --no-think disables models whose default is to think.
        think,
        stream: true,
    });
    for await (const chunk of stream) {
        const now = performance.now();
        if (chunk.thinking) {
            if (!thinkStartAt)
                thinkStartAt = now;
            thinkEndAt = now;
            thinkingChars += chunk.thinking.length;
        }
        if ((chunk.response || chunk.thinking) && !firstTokenAt)
            firstTokenAt = now;
        if (chunk.done)
            final = chunk;
    }
    if (!final)
        throw new Error('No response received from server');
    return {
        loadTime: final.load_duration / 1e9,
        promptEvalTime: final.prompt_eval_duration / 1e9,
        promptEvalCount: final.prompt_eval_count,
        generationTime: final.eval_duration / 1e9,
        evalCount: final.eval_count,
        totalTime: final.total_duration / 1e9,
        ttft: firstTokenAt ? (firstTokenAt - start) / 1000 : 0,
        thinkingChars,
        thinkingWallTime: thinkStartAt ? (thinkEndAt - thinkStartAt) / 1000 : 0,
    };
}
/**
 * Benchmarks a model across one or more runs and aggregates the results.
 */
async function benchmarkModel(client, model, opts) {
    // Decide whether to enable thinking.
    let think = opts.think;
    if (opts.noThink)
        think = false;
    else if (think === undefined) {
        const caps = await modelCapabilities(client, model);
        think = caps.includes('thinking') ? true : false;
    }
    const label = think ? `${model} ${colorize('(thinking)', 'magenta')}` : model;
    const spinner = new Spinner(colorize(`Benchmarking ${label}…`, 'blue')).start();
    const samples = [];
    try {
        for (let r = 0; r < opts.runs; r++) {
            if (opts.runs > 1)
                spinner.update(colorize(`Benchmarking ${label} — run ${r + 1}/${opts.runs}…`, 'blue'));
            samples.push(await runOnce(client, model, opts.prompt, think));
        }
        spinner.stop();
    }
    catch (error) {
        spinner.stop();
        return {
            model,
            ok: false,
            error: error.message,
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
            thinking: false,
            thinkingTime: 0,
            thinkingChars: 0,
            thinkingCharsPerSecond: 0,
        };
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
    let sizeBytes;
    let sizeVramBytes;
    let parameterSize;
    let quantization;
    try {
        const { models } = await client.ps();
        const live = models.find((m) => m.name === model || m.model === model);
        if (live) {
            sizeBytes = live.size;
            sizeVramBytes = live.size_vram;
            parameterSize = live.details?.parameter_size;
            quantization = live.details?.quantization_level;
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
        const where = r.sizeVramBytes && r.sizeVramBytes > 0 ? 'GPU' : 'CPU';
        const detail = [
            r.parameterSize,
            r.quantization,
            r.sizeBytes ? fmtBytes(r.sizeBytes) : undefined,
            r.sizeVramBytes ? `${fmtBytes(r.sizeVramBytes)} VRAM · ${where}` : where,
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
    }
    line('Generation', fmtDuration(r.generationTime), `${Math.round(r.evalCount)} tok · ${pct(r.generationTime)} of total`);
    console.log();
    line(colorize('Speed', 'green'), colorize(fmtRate(r.tokensPerSecond), 'green'), colorize('total ' + fmtDuration(r.totalTime), 'gray'));
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
/**
 * Orchestrates argument parsing, model preparation, benchmarking and output.
 */
export async function main() {
    const opts = parseArgs(process.argv.slice(2));
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
    const client = new Ollama(opts.host ? { host: opts.host } : undefined);
    const serverVersion = await ensureServer(client);
    if (!opts.json) {
        console.log(colorize('ollama-bench', 'cyan') + colorize(`  ·  server v${serverVersion}`, 'gray'));
        console.log(colorize('═'.repeat(52), 'cyan'));
        console.log(colorize('\nPreparing models', 'cyan'));
        console.log(colorize('─'.repeat(52), 'gray'));
    }
    for (const model of opts.models) {
        await pullModel(client, model);
    }
    if (!opts.json) {
        console.log(colorize('\nBenchmarking', 'cyan'));
        console.log(colorize('─'.repeat(52), 'gray'));
    }
    const results = [];
    for (const model of opts.models) {
        const result = await benchmarkModel(client, model, opts);
        results.push(result);
        if (!opts.json)
            renderResult(result);
    }
    if (opts.json) {
        console.log(JSON.stringify({ server: serverVersion, prompt: opts.prompt, results }, null, 2));
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
        console.error('Error:', error);
        process.exit(1);
    });
}
