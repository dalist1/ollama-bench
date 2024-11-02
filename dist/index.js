#!/usr/bin/env node
import ollama from 'ollama';
/**
 * Object containing ANSI color codes for text coloring.
 */
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    cyan: '\x1b[36m',
    magenta: '\x1b[35m',
    blue: '\x1b[34m',
};
/**
 * Object containing emoji characters for various status indicators.
 */
const emojis = {
    rocket: '🚀',
    check: '✅',
    error: '❌',
    hourglass: '⏳',
    star: '⭐',
    trophy: '🏆',
    gear: '⚙️',
};
/**
 * Applies color to the given text.
 * @param text - The text to colorize.
 * @param color - The color to apply.
 * @returns The colorized text.
 */
function colorize(text, color) {
    return `${colors[color]}${text}${colors.reset}`;
}
/**
 * Creates a loading animation for the console.
 * @param operation - The operation being performed.
 * @param model - The model being processed.
 * @returns An interval ID for the animation.
 */
function createLoadingAnimation(operation, model) {
    const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    let i = 0;
    let dots = 0;
    return setInterval(() => {
        const frame = frames[i];
        const dotString = '.'.repeat(dots);
        const operationText = colorize(`${operation} ${model}${dotString}`, 'blue');
        process.stdout.write(`\r${frame} ${emojis.gear} ${operationText}`.padEnd(50));
        i = (i + 1) % frames.length;
        dots = (dots + 1) % 4;
    }, 100);
}
/**
 * Pulls a model from Ollama.
 * @param model - The name of the model to pull.
 */
async function pullModel(model) {
    console.log(colorize(`${emojis.rocket} Initiating pull for ${model}...`, 'yellow'));
    const loadingAnimation = createLoadingAnimation('Pulling', model);
    try {
        const start = performance.now();
        const response = await ollama.pull({ model, stream: true });
        for await (const part of response) {
            if (part.status === 'success') {
                clearInterval(loadingAnimation);
                const end = performance.now();
                const duration = (end - start) / 1000;
                console.log(`\r${colorize(`${emojis.check} Successfully pulled ${model} in ${duration.toFixed(2)} seconds`, 'green')}     `);
                return;
            }
        }
    }
    catch (error) {
        clearInterval(loadingAnimation);
        console.log(`\r${colorize(`${emojis.error} Error pulling ${model}: ${error.message}`, 'red')}     `);
    }
}
/**
 * Benchmarks a model's performance.
 * @param model - The name of the model to benchmark.
 * @returns A promise that resolves to the benchmark result.
 */
async function benchmarkModel(model) {
    const prompt = "Explain the theory of relativity in simple terms.";
    console.log(colorize(`${emojis.hourglass} Initiating benchmark for ${model}...`, 'cyan'));
    const loadingAnimation = createLoadingAnimation('Benchmarking', model);
    try {
        const response = await ollama.generate({
            model,
            prompt,
            stream: false,
        });
        clearInterval(loadingAnimation);
        const totalDuration = response.total_duration / 1e9; // Convert nanoseconds to seconds
        const tokensPerSecond = response.eval_count / (response.eval_duration / 1e9);
        console.log(`\r${colorize(`${emojis.star} Benchmark results for ${model}:`, 'cyan')}     `);
        console.log(colorize(`  Total time: ${totalDuration.toFixed(2)} seconds`, 'yellow'));
        console.log(colorize(`  Tokens generated: ${response.eval_count}`, 'yellow'));
        console.log(colorize(`  Tokens per second: ${tokensPerSecond.toFixed(2)}`, 'yellow'));
        console.log();
        return { model, tokensPerSecond };
    }
    catch (error) {
        clearInterval(loadingAnimation);
        console.log(`\r${colorize(`${emojis.error} Error benchmarking ${model}: ${error.message}`, 'red')}     `);
        return { model, tokensPerSecond: 0 };
    }
}
/**
 * The main function that orchestrates the model pulling and benchmarking process.
 */
export async function main() {
    const models = process.argv.slice(2);
    if (models.length === 0) {
        console.log(colorize(`${emojis.error} Error: No models provided. Please specify at least one model.`, 'red'));
        process.exit(1);
    }
    console.log(colorize(`${emojis.rocket} Ollama Benchmark Script`, 'cyan'));
    console.log(colorize("=======================", 'cyan'));
    // Pull models
    for (const model of models) {
        await pullModel(model);
    }
    console.log();
    // Benchmark models
    const results = [];
    for (const model of models) {
        const result = await benchmarkModel(model);
        results.push(result);
    }
    // Find the best performing model
    const bestModel = results.reduce((best, current) => current.tokensPerSecond > best.tokensPerSecond ? current : best);
    console.log(colorize(`${emojis.trophy} Best performing model:`, 'magenta'));
    console.log(colorize(`  ${bestModel.model} with ${bestModel.tokensPerSecond.toFixed(2)} tokens/second`, 'magenta'));
}
if (import.meta.url === import.meta.resolve(process.argv[1])) {
    main().catch(error => {
        console.error('Error:', error);
        process.exit(1);
    });
}
