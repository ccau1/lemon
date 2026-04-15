# Getting Started

## Prerequisites

- Node.js >= 20
- pnpm >= 10

## Install Dependencies

```bash
pnpm install
```

## Build All Packages

```bash
pnpm build
```

## Run the Server

```bash
pnpm --filter @lemon/cli dev serve
```

## Run the Web App (Dev)

```bash
pnpm --filter @lemon/web dev
```

## Run the Electron App (Dev)

Ensure the web app dev server is running on port 5173, then:

```bash
pnpm --filter @lemon/electron dev
```
node packages/cli/dist/index.js model add "kimi" \
  --provider openai-compatible \
  --base-url https://api.moonshot.cn/v1 \
  --api-key sk-v3VXvCiwhkeXi1WSXghtZOx1CuztQMMKTfyzCG5B1IWSJ5ee \
  --model-id kimi-latest

curl https://api.moonshot.cn/v1/models \
  -H "Authorization: Bearer sk-I6WXsKD3rdVqEG0TzOUhEUqeHuMgcFxBHpjcjPxvakBxMu6C"
{"error":{"message":"Invalid Authentication","type":"invalid_authentication_error"}}
  sk-I6WXsKD3rdVqEG0TzOUhEUqeHuMgcFxBHpjcjPxvakBxMu6C

curl https://api.moonshot.cn/v1/chat/completions \
  -H "Authorization: Bearer sk-I6WXsKD3rdVqEG0TzOUhEUqeHuMgcFxBHpjcjPxvakBxMu6C" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "kimi-latest",
    "messages": [{"role": "user", "content": "hello"}]
  }'

curl -s https://api.moonshot.ai/v1/chat/completions \
  -H "Authorization: Bearer sk-I6WXsKD3rdVqEG0TzOUhEUqeHuMgcFxBHpjcjPxvakBxMu6C" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "kimi-k2.5",
    "messages": [{"role": "user", "content": "hello"}],
    "max_tokens": 10
  }'