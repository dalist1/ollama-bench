# Ollama-bench
A command-line tool to benchmark and compare the performance of Ollama language models. Measures tokens per second and total processing time.

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

### 2. Start Ollama Server
Before running any benchmarks, make sure the Ollama server is running:

```bash
# On Linux/macOS terminal or Windows PowerShell
ollama serve
```

For Windows users, you can also run Ollama from the system tray after installation.

### 3. Install Benchmark Tool
Install globally:
```bash
npm install -g ollama-bench
```
Or run directly with npx:
```bash
npx ollama-bench <model1> [model2] [model3]
```

## Usage
```bash
# Using global installation
ollama-bench smollm:135m qwen2.5:0.5b

# Using npx (no installation required)
npx ollama-bench smollm:135m qwen2.5:0.5b
```

## Troubleshooting

If you encounter errors, check:
1. Is the Ollama server running? (`ollama serve`)
2. Can you access `http://localhost:11434`?
3. Do you have enough RAM for your chosen models?

## Available Models

See [ollama.com/library](https://ollama.com/library) for all available models.

## License

MIT