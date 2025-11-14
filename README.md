# Ollama-bench

Minimal CLI tool to benchmark Ollama models with detailed phase analysis. Zero runtime dependencies.

## Features

- Phase-by-phase performance breakdown
- Precise timing measurements
- Works with npm, pnpm, yarn, and bun

## Quick Start

```bash
# Run directly (no installation)
npx ollama-bench qwen2.5:0.5b llama3.2:1b

# Or with other package managers
bunx ollama-bench qwen2.5:0.5b
pnpm dlx ollama-bench qwen2.5:0.5b
```

## Prerequisites

1. **Install Ollama** - [ollama.com/download](https://ollama.com/download)
2. **Start Ollama server** - Run `ollama serve`

## Benchmark Phases

Each benchmark measures three distinct phases:

**Phase 1: Model Loading** (Loading weights into memory)
- Time to load model from disk into RAM
- Hardware-dependent, very consistent

**Phase 2: Prompt Processing** (Encoding input)
- Time to encode and process your input prompt
- Fast, scales with prompt length

**Phase 3: Response Generation** (Creating output)
- Time to generate the actual response
- Most important metric for user-facing performance
- Varies with content complexity


## Available Models

See [ollama.com/library](https://ollama.com/library) for all available models.

## License

MIT