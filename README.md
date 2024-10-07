```markdown
# Ollama Benchmark Script

This project benchmarks the performance of various large language models using the Ollama platform. The script automates model downloads, runs benchmarks, and outputs the performance metrics to identify the fastest model for your use case.

## Setup

Follow the instructions below to set up Ollama on your platform and run the benchmark script:

### 1. Install Ollama

- **macOS:** [Download Ollama](https://ollama.com/download/Ollama-darwin.zip)
- **Windows Preview:** [Download Ollama](https://ollama.com/download/OllamaSetup.exe)
- **Linux:** Run the following command:

  ```bash
  curl -fsSL https://ollama.com/install.sh | sh
  ```

  For manual installation instructions, see the [Linux guide](https://github.com/ollama/ollama/blob/main/docs/linux.md).
- **Docker:** Use the [official Ollama Docker image](https://hub.docker.com/r/ollama/ollama).

### 2. Start the Ollama Server

To serve models locally, start the Ollama server with the command:

```bash
ollama serve
```

### 3. Run the Benchmark Script

After setting up the server, you can run the benchmark script using Node.js. The script will automatically pull the specified models and benchmark their performance.

```bash
node ollama-bench.js <model1> <model2> <model3>
```

For example, to benchmark `llama3.2` and `gemma2` models:

```bash
node ollama-bench.js llama3.2 gemma2
```

## Results

The script outputs benchmark results such as total time, tokens generated, and tokens per second for each model, and highlights the best performing model.
