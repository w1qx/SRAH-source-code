import type { ChatMessage, LLMProvider, PartialUserFinancialData } from '@shared/types';
import { ApiError } from '@/shared/http/api-error';
import { logger } from '@/shared/logger';
import { parseUntrusted } from '@/shared/http/validate';
import {
  PartialUserFinancialDataSchema,
  UserFinancialDataSchema,
} from '@/shared/schemas/financial-data.schema';
import type { AnalysisRepository } from '@/modules/analysis/infrastructure/analysis.repository';
import type { ChatRepository, ChatSessionRecord } from '../infrastructure/chat.repository';
import { isCollectionComplete, mergeExtracted, nextQuestion, progress } from '../domain/extraction';
import { askedFields } from '../domain/questions';
import type { ChatPullConfig } from './financial-pull';
import { pullFinancialData, resolveAutoPulled } from './financial-pull';

export interface ChatTurnResult {
  chatSessionId: string;
  reply: string;
  extracted: PartialUserFinancialData;
  complete: boolean;
  progress: { collected: number; total: number };
  /** The next question, with its quick-replies — lets the UI render tap-to-answer buttons. */
  nextQuestion?: { field: string; ar: string; en: string; quickReplies?: unknown };
  /** Set once collection completes: the persisted input, ready to hand to /analysis. */
  financialInputId?: string;
}

/**
 * Orchestrates the chatbot: transcript in, structured data out.
 *
 * THE TRUST BOUNDARY IS HERE. The LLM's output does not go into the database because the model
 * said so — it goes in because Zod agreed. `PartialUserFinancialDataSchema` is `.strict()`, so a
 * hallucinated field name is rejected outright rather than silently dropped, and every value is
 * bounds-checked. A model that claims a salary of 10^9 SAR gets a validation error, not a row.
 *
 * The model is never told what the engine concluded, never sees the SAMA rules, and never sees
 * the CPI. It cannot leak an analysis it was never given.
 */
export class ChatService {
  constructor(
    private readonly llm: LLMProvider,
    private readonly chatRepository: ChatRepository,
    private readonly analysisRepository: AnalysisRepository,
    /** Auto-pull wiring. Absent (the default) → nothing is pulled and all 11 fields are asked. */
    private readonly pull: ChatPullConfig = {},
  ) {}

  async start(userId: string): Promise<ChatTurnResult> {
    const session = await this.chatRepository.create(userId);
    return this.toResult(session, await this.resolveAutoPulled());
  }

  async sendMessage(
    userId: string,
    chatSessionId: string,
    userMessage: string,
  ): Promise<ChatTurnResult> {
    const session = await this.load(userId, chatSessionId);

    if (session.complete) {
      throw ApiError.badRequest('This conversation is already complete.');
    }

    const transcript: ChatMessage[] = [...session.transcript, { role: 'user', content: userMessage }];

    const turn = await this.llm.next(transcript);

    // Validate the model's extraction BEFORE it touches anything. Untrusted input is untrusted
    // input, whether it arrived over HTTP or came out of a language model.
    const validated = parseUntrusted(PartialUserFinancialDataSchema, turn.extracted);
    if (!validated.ok) {
      // Do not persist the garbage, and do not fail the user's conversation over it. Keep what we
      // already had, and let them answer again.
      logger.warn('Discarded invalid LLM extraction', {
        userId,
        chatSessionId,
        issues: validated.issues,
      });
    }

    const extracted = validated.ok
      ? mergeExtracted(session.extracted, validated.data)
      : session.extracted;

    const withReply: ChatMessage[] = [...transcript, { role: 'assistant', content: turn.reply }];

    // Which fields are auto-pulled (GOSI/SIMAH) vs. asked — decided by the feature flags at this
    // moment. With both off, `autoPulled` is empty and every field is asked, exactly as before.
    const autoPulled = await this.resolveAutoPulled();
    const asked = askedFields(autoPulled);

    // The model's own `complete` flag is a HINT, not the verdict. Completeness is decided by
    // checking the data we actually hold — a model that declares victory early does not get to
    // push a half-filled form into the SAMA engine. Only the ASKED fields count here; the pulled
    // ones are filled below.
    const complete = isCollectionComplete(extracted, asked);

    // On completion, fill the auto-pulled fields, then freeze the merged data into a
    // financial_input row. This is the handoff: /analysis takes it by id, and the analysis's
    // provenance can point at the exact inputs it ran on, forever.
    let financialInputId = session.extractedInputId ?? undefined;
    if (complete && !financialInputId) {
      const { pulled } = await pullFinancialData(userId, this.pull);
      const final = UserFinancialDataSchema.safeParse({ ...extracted, ...pulled });
      if (final.success) {
        const created = await this.analysisRepository.createFinancialInput(
          userId,
          final.data,
          'chatbot',
        );
        financialInputId = created.id;
        logger.info('Chat collection complete', {
          userId,
          chatSessionId,
          financialInputId,
          autoPulled: [...autoPulled],
        });
      }
    }

    const updated = await this.chatRepository.update(session.id, {
      transcript: withReply,
      extracted,
      complete: complete && Boolean(financialInputId),
      ...(financialInputId ? { extractedInputId: financialInputId } : {}),
    });

    return { ...this.toResult(updated, autoPulled), reply: turn.reply };
  }

  async get(userId: string, chatSessionId: string): Promise<ChatTurnResult> {
    const session = await this.load(userId, chatSessionId);
    return this.toResult(session, await this.resolveAutoPulled());
  }

  private async load(userId: string, chatSessionId: string): Promise<ChatSessionRecord> {
    const session = await this.chatRepository.findById(userId, chatSessionId);
    if (!session) throw ApiError.notFound('Chat session not found.');
    return session;
  }

  /** The fields being auto-pulled right now, per the feature flags. Empty when both are off. */
  private resolveAutoPulled(): Promise<Set<keyof PartialUserFinancialData>> {
    return resolveAutoPulled(this.pull);
  }

  private toResult(
    session: ChatSessionRecord,
    autoPulled: ReadonlySet<keyof PartialUserFinancialData> = new Set(),
  ): ChatTurnResult {
    const asked = askedFields(autoPulled);
    const question = nextQuestion(session.extracted, asked);
    const lastAssistant = [...session.transcript].reverse().find((m) => m.role === 'assistant');

    return {
      chatSessionId: session.id,
      reply: lastAssistant?.content ?? question?.ar ?? '',
      extracted: session.extracted,
      complete: session.complete,
      progress: progress(session.extracted, asked),
      ...(question
        ? {
            nextQuestion: {
              field: question.field,
              ar: question.ar,
              en: question.en,
              quickReplies: question.quickReplies,
            },
          }
        : {}),
      ...(session.extractedInputId ? { financialInputId: session.extractedInputId } : {}),
    };
  }
}
