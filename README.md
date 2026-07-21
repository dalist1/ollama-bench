# Ollama-bench

Minimal CLI for benchmarking Ollama models with server-authoritative phase timings, client-observed latency, reasoning measurement, and side-by-side rankings.

## Features

- Load, prompt-evaluation, and output-evaluation timings from Ollama's final stream event
- **TTFT** (time to the first streamed output) plus end-to-end wall time
- Thinking/reasoning support, including `low`, `medium`, `high`, and the latest `max` effort level
- Separate first-answer latency and thinking-stream duration for reasoning models
- Deterministic, bounded runs (`seed: 42`, maximum 256 output tokens by default)
- Model size, quantization, context length, and CPU/GPU/partial-VRAM placement
- Multi-run averaging and an aligned comparison table
- Fast preparation: locally installed models are not pulled again unless `--pull` is used
- Local servers, `OLLAMA_HOST`, and authenticated direct `ollama.com` cloud access
- TTY-aware output and machine-readable JSON (`NO_COLOR` is honored)

The implementation follows Ollama's current [Generate](https://docs.ollama.com/api/generate), [Usage](https://docs.ollama.com/api/usage), [Streaming](https://docs.ollama.com/api/streaming), [Thinking](https://docs.ollama.com/capabilities/thinking), and [Authentication](https://docs.ollama.com/api/authentication) documentation.

## Quick start

```bash
npx ollama-bench qwen3:0.6b llama3.2:1b

# Also works with other package runners
bunx ollama-bench qwen3:0.6b
pnpm dlx ollama-bench qwen3:0.6b
```

## Prerequisites

For local models:

1. [Install Ollama](https://ollama.com/download).
2. Start it with `ollama serve`.

For direct cloud API access, set the documented credentials and host:

```bash
export OLLAMA_API_KEY=your_api_key
export OLLAMA_HOST=https://ollama.com
ollama-bench gpt-oss:120b
```

An API key is only read automatically when the configured host is `ollama.com`; it is not sent to custom hosts.

## Usage

```text
ollama-bench [options] <model> [model...]

Options
  --think[=low|medium|high|max] Set thinking or effort (model default if omitted)
  --no-think                    Disable thinking when the model supports it
  --prompt <text>               Custom benchmark prompt
  --runs <n>                    Repeat each model n times and average (default: 1)
  --tokens <n>                  Maximum output tokens per run (default: 256)
  --seed <n>                    Generation seed for repeatability (default: 42)
  --keep-alive <duration>       Keep models loaded between runs (default: 5m)
  --pull                        Refresh models even when already installed
  --host <url>                  Server URL (default: OLLAMA_HOST or localhost:11434)
  --json                        Emit machine-readable JSON
  --demo                        Render synthetic UI data without a server
  -v, --version                 Print version
  -h, --help                    Show help
```

Thinking is left unset by default so Ollama can apply the model's native behavior. This matters for models such as GPT-OSS, which use an effort level rather than a boolean. `--no-think` sends `false` explicitly, although models that cannot disable thinking may ignore it.

### Examples

```bash
# Compare models with bounded, reproducible output
ollama-bench qwen3:0.6b llama3.2:1b

# Three runs at the highest supported thinking effort
ollama-bench --runs 3 --think=max deepseek-r1:1.5b

# Shorter/faster run with a custom prompt
ollama-bench --tokens 96 --prompt "Write a haiku about TCP" gemma3:1b

# Force a registry refresh and produce JSON
ollama-bench --pull --json qwen3:0.6b > result.json
```

## Metrics

Ollama reports all server durations in nanoseconds in the final streamed event. Ollama-bench converts them to seconds and uses the documented formula `eval_count / eval_duration × 10^9` for output tokens/second.

- **Load**: server time spent loading the model.
- **Prompt eval**: input-token processing time and rate.
- **TTFT**: client wall time from request start to the first `thinking` or `response` chunk.
- **Thinking**: time from the first thinking chunk to the first answer chunk (or stream end), plus exact streamed character count/rate.
- **First answer token**: client wall time to visible response output for a thinking run.
- **Output eval**: Ollama's aggregate output token count, duration, and rate. For thinking models this server metric can include reasoning output; Ollama does not expose a separate thinking token count.
- **Server total / wall**: Ollama's `total_duration` alongside client-observed end-to-end duration.

A low `--tokens` value can be consumed entirely by a model's reasoning trace, in which case first-answer latency is unavailable. Increase `--tokens` when answer latency is important.

## JSON output

Progress is written to stderr, leaving stdout as one parseable JSON object:

```json
{
  "server": "0.12.0",
  "prompt": "Explain the theory of relativity in simple terms.",
  "settings": {
    "runs": 1,
    "numPredict": 256,
    "seed": 42,
    "think": "model-default",
    "keepAlive": "5m"
  },
  "results": [
    {
      "model": "qwen3:0.6b",
      "ok": true,
      "tokensPerSecond": 168.4,
      "ttft": 0.51,
      "timeToFirstResponse": 1.64,
      "wallTime": 2.43,
      "thinking": true,
      "thinkingTime": 1.13,
      "thinkingChars": 640,
      "loadTime": 0.42,
      "generationTime": 1.9,
      "totalTime": 2.4
    }
  ]
}
```

## Development

```bash
bun install --frozen-lockfile
bun run check
```

## Available models

See [ollama.com/search](https://ollama.com/search) for local, thinking, and cloud models.

## License

MIT
