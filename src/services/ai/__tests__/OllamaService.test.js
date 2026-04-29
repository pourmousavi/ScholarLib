import { afterEach, describe, expect, it, vi } from 'vitest'
import { ollamaService } from '../OllamaService'

function mockOkChat(responseContent = 'ok') {
  return vi.fn(async () => ({
    ok: true,
    json: async () => ({ message: { content: responseContent } }),
  }))
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('OllamaService.chat', () => {
  it('forwards num_ctx, num_predict, temperature, and format to /api/chat', async () => {
    const fetchSpy = mockOkChat()
    vi.stubGlobal('fetch', fetchSpy)

    await ollamaService.chat(
      [{ role: 'user', content: 'hi' }],
      'llama3.1:8b',
      { temperature: 0.2, num_ctx: 32768, maxTokens: 4096, format: 'json' }
    )

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [, init] = fetchSpy.mock.calls[0]
    const body = JSON.parse(init.body)
    expect(body.format).toBe('json')
    expect(body.options).toEqual({
      temperature: 0.2,
      num_ctx: 32768,
      num_predict: 4096,
    })
  })

  it('omits options when no runtime fields are provided', async () => {
    const fetchSpy = mockOkChat()
    vi.stubGlobal('fetch', fetchSpy)

    await ollamaService.chat([{ role: 'user', content: 'hi' }], 'llama3.1:8b')

    const body = JSON.parse(fetchSpy.mock.calls[0][1].body)
    expect(body.options).toBeUndefined()
    expect(body.format).toBeUndefined()
  })

  it('prefers num_predict over maxTokens when both are provided', async () => {
    const fetchSpy = mockOkChat()
    vi.stubGlobal('fetch', fetchSpy)

    await ollamaService.chat(
      [{ role: 'user', content: 'hi' }],
      'llama3.1:8b',
      { num_predict: 1234, maxTokens: 4096 }
    )

    const body = JSON.parse(fetchSpy.mock.calls[0][1].body)
    expect(body.options.num_predict).toBe(1234)
  })
})
