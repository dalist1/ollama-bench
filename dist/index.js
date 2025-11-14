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
    const frames = ['|', '/', '-', '\\'];
    let i = 0;
    let dots = 0;
    return setInterval(() => {
        const frame = frames[i];
        const dotString = '.'.repeat(dots);
        const operationText = colorize(`${operation} ${model}${dotString}`, 'blue');
        process.stdout.write(`\r${frame} ${operationText}`.padEnd(50));
        i = (i + 1) % frames.length;
        dots = (dots + 1) % 4;
    }, 100);
}
/**
 * Pulls a model from Ollama.
 * @param model - The name of the model to pull.
 */
async function pullModel(model) {
    console.log(colorize(`Initiating pull for ${model}...`, 'yellow'));
    const loadingAnimation = createLoadingAnimation('Pulling', model);
    try {
        const start = performance.now();
        const response = await ollama.pull({ model, stream: true });
        for await (const part of response) {
            if (part.status === 'success') {
                clearInterval(loadingAnimation);
                const end = performance.now();
                const duration = (end - start) / 1000;
                console.log(`\r${colorize(`Successfully pulled ${model} in ${duration.toFixed(2)} seconds`, 'green')}     `);
                return;
            }
        }
    }
    catch (error) {
        clearInterval(loadingAnimation);
        console.log(`\r${colorize(`Error pulling ${model}: ${error.message}`, 'red')}     `);
    }
}
/**
 * Benchmarks a model's performance.
 * @param model - The name of the model to benchmark.
 * @returns A promise that resolves to the benchmark result.
 */
async function benchmarkModel(model) {
    const prompt = "Explain the theory of relativity in simple terms.";
    console.log(colorize(`\nBenchmarking ${model}`, 'cyan'));
    console.log(colorize('─'.repeat(50), 'cyan'));
    const loadingAnimation = createLoadingAnimation('Running benchmark', model);
    try {
        const response = await ollama.generate({
            model,
            prompt,
            stream: false,
        });
        clearInterval(loadingAnimation);
        process.stdout.write('\r' + ' '.repeat(50) + '\r');
        // Calculate phase timings
        const loadTime = response.load_duration / 1e9;
        const promptEvalTime = response.prompt_eval_duration / 1e9;
        const generationTime = response.eval_duration / 1e9;
        const totalTime = response.total_duration / 1e9;
        const tokensPerSecond = response.eval_count / generationTime;
        // Calculate percentages
        const loadPercent = (loadTime / totalTime * 100).toFixed(1);
        const promptPercent = (promptEvalTime / totalTime * 100).toFixed(1);
        const genPercent = (generationTime / totalTime * 100).toFixed(1);
        // Display phases
        console.log(colorize('Phase 1: Model Loading (Loading weights into memory)', 'yellow'));
        console.log(colorize(`  Time: ${loadTime.toFixed(2)}s (${loadPercent}% of total)`, 'yellow'));
        console.log();
        console.log(colorize('Phase 2: Prompt Processing (Encoding input)', 'yellow'));
        console.log(colorize(`  Tokens: ${response.prompt_eval_count}`, 'yellow'));
        console.log(colorize(`  Time: ${promptEvalTime.toFixed(2)}s (${promptPercent}% of total)`, 'yellow'));
        console.log(colorize(`  Speed: ${(response.prompt_eval_count / promptEvalTime).toFixed(2)} tokens/s`, 'yellow'));
        console.log();
        console.log(colorize('Phase 3: Response Generation (Creating output)', 'yellow'));
        console.log(colorize(`  Tokens: ${response.eval_count}`, 'yellow'));
        console.log(colorize(`  Time: ${generationTime.toFixed(2)}s (${genPercent}% of total)`, 'yellow'));
        console.log(colorize(`  Speed: ${tokensPerSecond.toFixed(2)} tokens/s`, 'yellow'));
        console.log();
        console.log(colorize('Summary', 'green'));
        console.log(colorize(`  Total time: ${totalTime.toFixed(2)}s`, 'green'));
        console.log(colorize(`  Generation speed: ${tokensPerSecond.toFixed(2)} tokens/s`, 'green'));
        console.log();
        return {
            model,
            tokensPerSecond,
            loadTime,
            promptEvalTime,
            generationTime,
            totalTime
        };
    }
    catch (error) {
        clearInterval(loadingAnimation);
        process.stdout.write('\r' + ' '.repeat(50) + '\r');
        console.log(colorize(`Error benchmarking ${model}: ${error.message}`, 'red'));
        console.log();
        return {
            model,
            tokensPerSecond: 0,
            loadTime: 0,
            promptEvalTime: 0,
            generationTime: 0,
            totalTime: 0
        };
    }
}
/**
 * The main function that orchestrates the model pulling and benchmarking process.
 */
export async function main() {
    const models = process.argv.slice(2);
    if (models.length === 0) {
        console.log(colorize(`Error: No models provided. Please specify at least one model.`, 'red'));
        process.exit(1);
    }
    console.log(colorize(`Ollama Benchmark Script`, 'cyan'));
    console.log(colorize('═'.repeat(50), 'cyan'));
    // Pull models
    console.log(colorize('\nPhase: Model Preparation', 'cyan'));
    console.log(colorize('─'.repeat(50), 'cyan'));
    for (const model of models) {
        await pullModel(model);
    }
    // Benchmark models
    console.log(colorize('\nPhase: Performance Testing', 'cyan'));
    console.log(colorize('─'.repeat(50), 'cyan'));
    const results = [];
    for (const model of models) {
        const result = await benchmarkModel(model);
        results.push(result);
    }
    // Find the best performing model
    const bestModel = results.reduce((best, current) => current.tokensPerSecond > best.tokensPerSecond ? current : best);
    console.log(colorize('Final Results', 'magenta'));
    console.log(colorize('═'.repeat(50), 'magenta'));
    console.log(colorize(`Best performing model: ${bestModel.model}`, 'magenta'));
    console.log(colorize(`Generation speed: ${bestModel.tokensPerSecond.toFixed(2)} tokens/s`, 'magenta'));
    console.log(colorize(`Total time: ${bestModel.totalTime.toFixed(2)}s`, 'magenta'));
}
if (import.meta.url === import.meta.resolve(process.argv[1])) {
    main().catch(error => {
        console.error('Error:', error);
        process.exit(1);
    });
}
