# Ollama-bench

Minimal CLI tool to benchmark Ollama models with detailed phase-by-phase analysis — now with **time-to-first-token (TTFT)**, **reasoning/thinking** measurement, GPU/VRAM reporting, and a side-by-side ranking table.

## Features

- Phase-by-phase performance breakdown (load · prompt eval · generation)
- **TTFT** (time to first token) — the metric that actually drives perceived latency
- **Reasoning models**: auto-detects thinking-capable models and measures the thinking phase separately
- Size / quantization / VRAM (GPU vs CPU) reporting via the live model state
- Aligned **ranking table** when comparing multiple models
- `--json` output for scripting and CI
- Multi-run averaging, custom prompts, custom host
- TTY-aware: colors/spinners on a terminal, clean plain text when piped (honors `NO_COLOR`)

## Quick Start

```bash
# Run directly (no installation)
npx ollama-bench qwen3:0.6b llama3.2:1b

# Or with other package managers
bunx ollama-bench qwen3:0.6b
pnpm dlx ollama-bench qwen3:0.6b
```

## Prerequisites

1. **Install Ollama** - [ollama.com/download](https://ollama.com/download)
2. **Start Ollama server** - Run `ollama serve`

## Usage

```
ollama-bench [options] <model> [model...]

Options
  --think[=high|medium|low]  Enable reasoning/thinking (auto-detected by default)
  --no-think                 Disable thinking even for reasoning models
  --prompt <text>            Custom benchmark prompt
  --runs <n>                 Repeat each model n times and average (default: 1)
  --host <url>               Ollama server URL (default: http://127.0.0.1:11434)
  --json                     Emit machine-readable JSON instead of the report
  --demo                     Render the UI with synthetic data (no server needed)
  -v, --version              Print version
  -h, --help                 Show this help
```

### Examples

```bash
# Compare two models
ollama-bench qwen3:0.6b llama3.2:1b

# Benchmark a reasoning model at high thinking effort, averaged over 3 runs
ollama-bench --runs 3 --think=high deepseek-r1:1.5b

# Custom prompt, JSON output for a script
ollama-bench --prompt "Write a haiku about TCP" --json gemma3:1b > result.json

# Preview the UI without an Ollama server
ollama-bench --demo
```

## Benchmark Phases

Each benchmark measures these phases (timings come straight from the Ollama server):

**Model Loading** — time to load weights into memory. Hardware-dependent, very consistent.

**Prompt Processing** — time to encode and process the input prompt. Fast, scales with prompt length.

**Thinking** *(reasoning models only)* — the model's streamed thinking text, measured separately from the visible answer. Automatically enabled for thinking-capable models such as `qwen3` and `deepseek-r1`. Ollama does not expose separate thinking token counts, so ollama-bench reports exact thinking characters and chars/sec instead of estimating tokens.

**Response Generation** — time to generate the output tokens. The most important metric for user-facing performance.

Alongside the phases, ollama-bench reports **TTFT** (wall-clock time to the first streamed token) and the model's **size / quantization / VRAM** placement.

## JSON output

`--json` writes a single JSON object to **stdout** (all progress goes to stderr, so the stream stays parseable):

```json
{
  "server": "0.12.0",
  "prompt": "Explain the theory of relativity in simple terms.",
  "results": [
    {
      "model": "qwen3:0.6b",
      "ok": true,
      "tokensPerSecond": 168.4,
      "ttft": 0.51,
      "thinking": true,
      "thinkingTime": 1.13,
      "thinkingChars": 640,
      "thinkingCharsPerSecond": 568,
      "loadTime": 0.42,
      "generationTime": 1.9,
      "totalTime": 2.4
    }
  ]
}
```

## Available Models

See [ollama.com/library](https://ollama.com/library) for all available models.

## License

MIT
