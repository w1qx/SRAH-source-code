import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import type { ChatMessage, LLMProvider, LLMTurn } from '@shared/types';
import { ApiError } from '@/shared/http/api-error';
import { logger } from '@/shared/logger';
import { SYSTEM_PROMPT } from '../domain/questions';

/**
 * The ONLY file in the codebase that talks to Anthropic. Scope v2 §13: every external
 * dependency sits behind an interface, and this is the LLMProvider port's real adapter.
 *
 * The model is used as a STRUCTURED OUTPUT device, not an oracle:
 *   - `output_config.format` constrains it to a JSON schema, so it cannot ramble its way out
 *     of the contract and we never scrape numbers out of prose.
 *   - Its output is then validated AGAIN with Zod (below), because a schema-constrained model
 *     is still an untrusted input source.
 *   - It is validated a THIRD time in the chat service against the strict
 *     PartialUserFinancialDataSchema before anything is written to the database.
 *
 * It never calculates and never advises — the system prompt forbids it, and the architecture
 * makes it impossible: this adapter is never given the SAMA rules, the CPI figure, or the
 * engine. It literally does not have the numbers to misuse.
 */

/**
 * The schema the model is CONSTRAINED to. Deliberately loose — bounds like "salary ≤ 1,000,000"
 * are not expressible in a way structured outputs supports, and they are not this layer's job.
 * Every field is nullable rather than optional: "I did not hear this yet" is a fact the model
 * should be able to state explicitly, rather than communicate by omission.
 */
const nullable = (schema: Record<string, unknown>) => ({ anyOf: [schema, { type: 'null' }] });

const EXTRACTED_JSON_SCHEMA = {
  type: 'object',
  properties: {
    goal: nullable({
      type: 'string',
      enum: [
        'car',
        'wedding',
        'home',
        'education',
        'project',
        'debt_consolidation',
        'personal_need',
        'other',
      ],
    }),
    financingAmount: nullable({ type: 'number' }),
    termYears: nullable({ type: 'integer' }),
    grossSalary: nullable({ type: 'number' }),
    additionalIncome: nullable({ type: 'number' }),
    existingCommitments: nullable({ type: 'number' }),
    monthlyExpenses: nullable({ type: 'number' }),
    familyStatus: nullable({
      type: 'string',
      enum: ['single_no_dependents', 'married', 'with_dependents'],
    }),
    savings: nullable({ type: 'number' }),
    employmentSector: nullable({
      type: 'string',
      enum: ['government', 'private', 'semi_government', 'other'],
    }),
    tenureYears: nullable({ type: 'integer' }),
  },
  required: [
    'goal',
    'financingAmount',
    'termYears',
    'grossSalary',
    'additionalIncome',
    'existingCommitments',
    'monthlyExpenses',
    'familyStatus',
    'savings',
    'employmentSector',
    'tenureYears',
  ],
  additionalProperties: false,
} as const;

const TURN_JSON_SCHEMA = {
  type: 'object',
  properties: {
    reply: { type: 'string' },
    extracted: EXTRACTED_JSON_SCHEMA,
    complete: { type: 'boolean' },
  },
  required: ['reply', 'extracted', 'complete'],
  additionalProperties: false,
} as const;

/** Belt and braces: validate what came back, even though the schema constrained it. */
const LlmTurnSchema = z.object({
  reply: z.string().min(1),
  extracted: z.object({
    goal: z
      .enum([
        'car',
        'wedding',
        'home',
        'education',
        'project',
        'debt_consolidation',
        'personal_need',
        'other',
      ])
      .nullable(),
    financingAmount: z.number().finite().nullable(),
    termYears: z.number().int().nullable(),
    grossSalary: z.number().finite().nullable(),
    additionalIncome: z.number().finite().nullable(),
    existingCommitments: z.number().finite().nullable(),
    monthlyExpenses: z.number().finite().nullable(),
    familyStatus: z.enum(['single_no_dependents', 'married', 'with_dependents']).nullable(),
    savings: z.number().finite().nullable(),
    employmentSector: z.enum(['government', 'private', 'semi_government', 'other']).nullable(),
    tenureYears: z.number().int().nullable(),
  }),
  complete: z.boolean(),
});

export interface AnthropicLLMConfig {
  apiKey: string;
  model: string;
}

export class AnthropicLLMProvider implements LLMProvider {
  private readonly client: Anthropic;

  constructor(private readonly config: AnthropicLLMConfig) {
    this.client = new Anthropic({ apiKey: config.apiKey });
  }

  async next(messages: ChatMessage[]): Promise<LLMTurn> {
    try {
      const response = await this.client.messages.create({
        model: this.config.model,
        // One short JSON turn — a deliberately small ceiling, not a lowballed default.
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        // Asking "what did the user just tell me?" is not a reasoning problem. Low effort keeps
        // the conversation quick, which is the whole point of a chat data-entry flow.
        output_config: {
          effort: 'low',
          format: { type: 'json_schema', schema: TURN_JSON_SCHEMA },
        },
        messages: toAnthropicMessages(messages),
      });

      return this.parseTurn(response);
    } catch (error) {
      throw this.toApiError(error);
    }
  }

  private parseTurn(response: Anthropic.Message): LLMTurn {
    if (response.stop_reason === 'refusal') {
      // The model declined. Nothing to extract, and nothing worth guessing at.
      throw new ApiError(
        503,
        'llm_unavailable',
        'The assistant could not process that message. Please rephrase, or enter your data on the form.',
      );
    }

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');

    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      logger.error('LLM returned output that is not JSON despite a constrained schema');
      throw new ApiError(502, 'llm_unavailable', 'The assistant returned an unreadable response.');
    }

    const parsed = LlmTurnSchema.safeParse(raw);
    if (!parsed.success) {
      logger.error('LLM output failed validation at the boundary', {
        issues: parsed.error.issues.map((i) => i.path.join('.')),
      });
      throw new ApiError(502, 'llm_unavailable', 'The assistant returned an unexpected response.');
    }

    return {
      reply: parsed.data.reply,
      // null means "not collected yet" on the wire; the rest of the system speaks `undefined`.
      extracted: stripNulls(parsed.data.extracted),
      complete: parsed.data.complete,
    };
  }

  /**
   * The SDK's typed errors, mapped to ours. A chat outage must never look like a bug in the
   * analysis engine — and it must never take the user's data down with it.
   */
  private toApiError(error: unknown): ApiError {
    if (error instanceof ApiError) return error;

    if (error instanceof Anthropic.RateLimitError) {
      logger.warn('Anthropic rate limit hit');
      return new ApiError(503, 'llm_unavailable', 'The assistant is busy. Please try again shortly.');
    }
    if (error instanceof Anthropic.AuthenticationError) {
      // Ours, not the user's — a misconfigured key must scream in the logs.
      logger.error('Anthropic authentication failed — check ANTHROPIC_API_KEY');
      return new ApiError(503, 'llm_unavailable', 'The assistant is unavailable.');
    }
    if (error instanceof Anthropic.APIConnectionError) {
      logger.warn('Could not reach Anthropic');
      return new ApiError(503, 'llm_unavailable', 'The assistant is unreachable. Please try again.');
    }
    if (error instanceof Anthropic.APIError) {
      logger.error('Anthropic API error', { status: error.status, message: error.message });
      return new ApiError(503, 'llm_unavailable', 'The assistant is unavailable.');
    }

    logger.error('Unexpected LLM failure', {
      error: error instanceof Error ? error.message : String(error),
    });
    return new ApiError(503, 'llm_unavailable', 'The assistant is unavailable.');
  }
}

function toAnthropicMessages(messages: ChatMessage[]): Anthropic.MessageParam[] {
  return messages
    // The system prompt is a top-level parameter, not a turn. A "system" message arriving in
    // the transcript would be us trying to smuggle instructions through the user channel.
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));
}

function stripNulls(extracted: Record<string, unknown>): LLMTurn['extracted'] {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(extracted)) {
    if (value !== null && value !== undefined) result[key] = value;
  }
  return result as LLMTurn['extracted'];
}
