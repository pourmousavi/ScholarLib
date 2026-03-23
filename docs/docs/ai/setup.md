---
sidebar_position: 1
---

# AI Setup

ScholarLib offers multiple AI options. Choose based on your privacy needs, budget, and hardware.

## Provider Comparison

| Provider | Quality | Privacy | Cost | Hardware |
|----------|---------|---------|------|----------|
| **WebLLM** | Basic | 100% Local | Free | WebGPU browser |
| **Ollama (1-3B)** | Basic | 100% Local | Free | 4-6 GB RAM |
| **Ollama (7-8B)** | Good | 100% Local | Free | 8-10 GB RAM |
| **Ollama (70B)** | Excellent | 100% Local | Free | 48-64 GB RAM |
| **Claude API** | Excellent | Cloud | $0.80-15/M tokens | None |
| **OpenAI** | Excellent | Cloud | $0.15-10/M tokens | None |

## Quality Expectations

### Basic (1-3B models)

Simple summaries and basic Q&A. May miss nuances or complex relationships between concepts. Good for quick lookups.

### Good (7-8B models)

Solid comprehension of academic papers. Handles most research questions well. Recommended for most users.

### Excellent (70B+ / APIs)

Deep understanding with nuanced analysis. Best for complex research synthesis and detailed explanations.

## Hardware Requirements

| Model Size | RAM Needed | Example Hardware |
|------------|------------|------------------|
| 1-3B | 4-6 GB | MacBook Air M1, any modern laptop |
| 7-8B | 8-10 GB | MacBook Pro M1/M2, 16GB laptop |
| 70B | 48-64 GB | Mac Studio, high-end workstation |

---

## Setup: WebLLM (Browser)

Runs entirely in your browser using WebGPU. No data leaves your device.

### Setup Steps

1. Go to Settings → AI & Models
2. Select "WebLLM (Browser)"
3. Choose a model (Llama 3.2 3B recommended)
4. Click "Download Model" (~2GB, one-time)

:::info Browser Requirements
Requires Chrome 113+, Edge 113+, or Safari 18+ with WebGPU.
:::

:::tip 100% Private
All processing happens locally in your browser. No data ever leaves your device.
:::

---

## Setup: Ollama (Local)

Runs AI on your computer via a local server. Fast, private, and supports larger models.

### Setup Steps

1. Download Ollama from [ollama.ai](https://ollama.ai)
2. Start Ollama with CORS enabled (see below)
3. In ScholarLib Settings, select "Ollama (Local)"
4. Click "Test connection" to verify
5. Use "Download New Model" to get models directly from Settings

### CORS Configuration (Required)

Ollama needs CORS enabled to work with web apps.

**macOS (temporary):**
```bash
OLLAMA_ORIGINS="*" ollama serve
```

**macOS (permanent):**
```bash
launchctl setenv OLLAMA_ORIGINS "*"
```

**Linux:**
```bash
OLLAMA_ORIGINS="*" ollama serve
```

**Windows (PowerShell):**
```powershell
$env:OLLAMA_ORIGINS="*"; ollama serve
```

:::tip 100% Private
All processing runs locally on your machine. Your documents never leave your computer.
:::

---

## Setup: Claude API

High-quality responses using Anthropic's Claude models. Best-in-class for academic work.

### Setup Steps

1. Create account at [console.anthropic.com](https://console.anthropic.com)
2. Add billing and generate an API key
3. Go to Settings → AI & Models → Claude API
4. Enter your API key and click "Test key"

### Pricing (approximate)

- **Haiku:** ~$0.80/M tokens (cheapest)
- **Sonnet:** ~$3/M input
- **Opus:** ~$15/M input

Typical Q&A session uses 1-5K tokens (~$0.01-0.05 for Haiku)

---

## Setup: OpenAI API

Access GPT-4o and other OpenAI models.

### Setup Steps

1. Create account at [platform.openai.com](https://platform.openai.com)
2. Add billing and generate an API key
3. Go to Settings → AI & Models → OpenAI API
4. Enter your API key and click "Test key"

### Pricing (approximate)

- **GPT-4o-mini:** ~$0.15/M input
- **GPT-4o:** ~$2.50/M input

---

## Troubleshooting

### "Cannot reach Ollama"

This usually means CORS is not configured. Make sure to start Ollama with:

```bash
OLLAMA_ORIGINS="*" ollama serve
```

If Ollama is already running, quit it completely first, then restart with the command above.

### "WebGPU not supported"

Your browser doesn't support WebGPU. Try:
- Chrome 113+ or Edge 113+ (enable at `chrome://flags` → WebGPU)
- Safari 18+ on macOS (enable in Developer menu)

### "API key invalid"

Check that you copied the full API key without extra spaces. For Claude, keys start with "sk-ant-". For OpenAI, keys start with "sk-".

### "Out of memory" / Slow responses

The model is too large for your hardware. Try a smaller model:
- For 8GB RAM: Use 3B models (llama3.2)
- For 16GB RAM: Use 7-8B models (llama3.1:8b)

---

## AI Status Indicator

The bottom of the sidebar shows your current AI status:

- 🟢 **Green dot** — AI is ready
- 🔴 **Red/gray dot** — AI is offline or not configured
