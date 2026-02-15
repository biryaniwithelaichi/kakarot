import { createLogger } from '../core/logger';
import { getBackendAPI } from './BackendAPIProvider';
import type { AIProvider, ChatMessage, ChatOptions } from './OpenAIProvider';

const logger = createLogger('BackendAIProvider');

/**
 * AI provider that routes all requests through the Treeto backend.
 * The backend handles authentication and routing to OpenAI.
 */
export class BackendAIProvider implements AIProvider {
  private model: string;

  constructor(model: string = 'gpt-4o') {
    this.model = model;
    logger.info('Backend AI provider initialized', { model: this.model });
  }

  async chat(messages: ChatMessage[], options: ChatOptions = {}): Promise<string> {
    const backendAPI = getBackendAPI();
    const model = options.model || this.model;

    // Convert to backend API format (OpenAI-compatible)
    const request = {
      messages: messages.map(msg => ({
        role: msg.role as 'system' | 'user' | 'assistant',
        content: msg.content,
      })),
      model,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 2000,
      ...(options.responseFormat === 'json' && {
        response_format: { type: 'json_object' as const },
      }),
    };

    logger.debug('Sending chat request via backend', { model, messageCount: messages.length });

    const response = await backendAPI.chat(request);
    const content = response.choices?.[0]?.message?.content || '';

    logger.debug('Chat completion via backend', {
      model,
      promptTokens: response.usage?.prompt_tokens,
      outputTokens: response.usage?.completion_tokens,
    });

    return content;
  }

  async *chatStream(messages: ChatMessage[], options: ChatOptions = {}): AsyncIterable<string> {
    // Fallback: Backend streaming not implemented, yield full response
    const response = await this.chat(messages, options);
    yield response;
  }

  async complete(prompt: string, model?: string): Promise<string> {
    return this.chat([{ role: 'user', content: prompt }], { model });
  }
}
