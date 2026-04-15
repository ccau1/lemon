import { test } from '@playwright/test'

export interface AiAssertOptions {
  prompt: string
  model?: string
  apiKey?: string
  baseUrl?: string
}

export async function aiAssert(
  screenshotBase64: string,
  options: AiAssertOptions
): Promise<{ pass: boolean; reasoning: string }> {
  const apiKey = options.apiKey || process.env.OPENAI_API_KEY
  const baseUrl = options.baseUrl || 'https://api.openai.com/v1'
  const model = options.model || 'gpt-4o'

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is required for aiAssert')
  }

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'system',
          content:
            'You are a UI test evaluator. Given a screenshot and a prompt, respond with ONLY a JSON object: {"pass": boolean, "reasoning": string}. Be strict.',
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: options.prompt },
            {
              type: 'image_url',
              image_url: { url: `data:image/png;base64,${screenshotBase64}` },
            },
          ],
        },
      ],
    }),
  })

  if (!res.ok) {
    throw new Error(`AI assert request failed: ${res.status}`)
  }

  const data = await res.json()
  const content = data.choices?.[0]?.message?.content || ''

  try {
    const json = JSON.parse(content)
    return { pass: Boolean(json.pass), reasoning: String(json.reasoning || '') }
  } catch {
    return { pass: false, reasoning: `Could not parse AI response: ${content}` }
  }
}

export function aiAssertTest(name: string, options: AiAssertOptions) {
  test(name, async ({ page }) => {
    const screenshot = await page.screenshot({ encoding: 'base64' })
    const result = await aiAssert(screenshot as string, options)
    if (!result.pass) {
      throw new Error(`AI assert failed: ${result.reasoning}`)
    }
  })
}
