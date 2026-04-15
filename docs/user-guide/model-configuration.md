# Model Configuration

Lemon supports multiple LLM models. You can define which model to use per workflow step and per project.

## Add a Model

```bash
lemon model add "gpt-4o" --provider openai --model-id gpt-4o --api-key $OPENAI_API_KEY
lemon model add "claude-3-7" --provider anthropic --api-key $ANTHROPIC_API_KEY --model-id claude-3-7-sonnet-20250219
lemon model add "local-llama" --provider openai --base-url http://localhost:11434/v1 --model-id llama3
lemon model add "claude-code" --provider claude-code-cli --model-id claude
lemon model add "kimi-code" --provider kimi-code-cli --model-id kimi
```

## Set Default Step Model

Global default:
```bash
lemon model default --step spec --model "claude-3-7"
```

Workspace override:
```bash
lemon model default --step plan --model "gpt-4o" --workspace "my-app"
```

## Per-Project Override

```bash
lemon model override --project "mobile-app" --step implement --model "local-llama"
```

## Model Resolution Order

1. Per-project/per-step override
2. Workspace default for step
3. Global default for step
4. First available model (fallback)
