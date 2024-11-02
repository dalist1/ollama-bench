# Ollama Benchmark Script

A command-line tool to benchmark and compare the performance of Ollama language models. Measures tokens per second, memory usage, and total processing time.

## Setup

### 1. Install Ollama

Choose your platform:

- **Windows:** [Download Installer](https://ollama.com/download/OllamaSetup.exe)
- **macOS:** [Download App](https://ollama.com/download/Ollama-darwin.zip)
- **Linux:** Run:
  ```bash
  curl -fsSL https://ollama.com/install.sh | sh
  ```
- **Docker:** Pull and run:
  ```bash
  docker pull ollama/ollama
  docker run -d -v ollama:/root/.ollama -p 11434:11434 ollama/ollama
  ```

### 2. Install Benchmark Tool

Install globally:
```bash
npm install -g ollama-benchmark
```

Or run directly with npx:
```bash
npx ollama-benchmark <model1> [model2] [model3]
```

## Usage

```bash
# Using global installation
ollama-benchmark smollm:135m qwen2.5:0.5b

# Using npx (no installation required)
npx ollama-benchmark smollm:135m qwen2.5:0.5b
```


See [ollama.com/library](https://ollama.com/library) for all available models.

## License

MIT