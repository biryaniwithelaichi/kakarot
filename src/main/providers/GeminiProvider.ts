import { createLogger } from '../core/logger';
import type { AIProvider, ChatMessage, ChatOptions } from './OpenAIProvider';

const logger = createLogger('GeminiProvider');

export interface GeminiProviderConfig {
  apiKey: string;
  model?: string;
}

export class GeminiProvider implements AIProvider {
  private apiKey: string;
  private model: string;
  private baseUrl = 'https://generativelanguage.googleapis.com/v1beta';

  constructor(config: GeminiProviderConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model || 'gemini-2.0-flash';
    logger.info('Gemini provider initialized', { model: this.model });
  }

  async chat(messages: ChatMessage[], options: ChatOptions = {}): Promise<string> {
    const model = options.model || this.model;
    const url = `${this.baseUrl}/models/${model}:generateContent`;

    const contents = this.convertMessages(messages);

    const body = {
      contents,
      generationConfig: {
        temperature: options.temperature ?? 0.3,
        maxOutputTokens: options.maxTokens ?? 1000,
        ...(options.responseFormat === 'json' && {
          responseMimeType: 'application/json',
        }),
      },
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-goog-api-key': this.apiKey,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      logger.error('Gemini API error', { status: response.status, error });
      throw new Error(`Gemini API error: ${response.status} ${error}`);
    }

    const data = await response.json();
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    logger.debug('Gemini completion', {
      model,
      promptTokens: data.usageMetadata?.promptTokenCount,
      outputTokens: data.usageMetadata?.candidatesTokenCount,
    });

    return content;
  }

  private convertMessages(messages: ChatMessage[]): Array<{ role: string; parts: Array<{ text: string }> }> {
    // Gemini uses 'user' and 'model' roles, and system prompts go in the first user message
    const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];
    let systemPrompt = '';

    for (const msg of messages) {
      if (msg.role === 'system') {
        systemPrompt += msg.content + '\n\n';
      } else if (msg.role === 'user') {
        const text = systemPrompt ? systemPrompt + msg.content : msg.content;
        contents.push({ role: 'user', parts: [{ text }] });
        systemPrompt = '';
      } else if (msg.role === 'assistant') {
        contents.push({ role: 'model', parts: [{ text: msg.content }] });
      }
    }

    return contents;
  }

  async *chatStream(messages: ChatMessage[], options: ChatOptions = {}): AsyncIterable<string> {
    // Fallback: Gemini streaming not implemented, yield full response
    const response = await this.chat(messages, options);
    yield response;
  }

  async complete(prompt: string, model?: string): Promise<string> {
    return this.chat([{ role: 'user', content: prompt }], { model });
  }
}
