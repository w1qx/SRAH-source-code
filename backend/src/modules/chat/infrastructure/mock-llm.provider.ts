import type { ChatMessage, LLMProvider, LLMTurn, PartialUserFinancialData } from '@shared/types';
import { isCollectionComplete, nextQuestion } from '../domain/extraction';
import { SCOPED_QUESTIONS } from '../domain/questions';

/**
 * A deterministic stand-in for the LLM.
 *
 * Two jobs, both real:
 *   1. Tests. The chat flow can be exercised end to end with no API key, no network, and no
 *      bill — and it produces the same answer every single run.
 *   2. LLM_PROVIDER=mock. The whole product stays demoable if Anthropic is down or a key expires.
 *
 * It asks the ten questions in order and reads back whatever the user typed. It is not clever
 * and is not trying to be — it is the same PORT as the real provider, which is the point.
 */
export class MockLLMProvider implements LLMProvider {
  async next(messages: ChatMessage[]): Promise<LLMTurn> {
    const extracted = replayTranscript(messages);
    const question = nextQuestion(extracted);
    const complete = isCollectionComplete(extracted);

    return {
      reply: question
        ? question.ar
        : 'شكراً لك، اكتملت بياناتك. يمكنك الآن مراجعتها وتحليل قرارك.',
      extracted,
      complete,
    };
  }
}

/**
 * Rebuild what has been collected by walking the transcript. The provider is STATELESS, exactly
 * like the real one: the conversation is the state, and it arrives with every call.
 */
function replayTranscript(messages: ChatMessage[]): PartialUserFinancialData {
  const extracted: PartialUserFinancialData = {};

  for (const message of messages) {
    if (message.role !== 'user') continue;

    const question = nextQuestion(extracted);
    if (!question) break;

    const value = parseAnswer(question.field, message.content);
    if (value !== undefined) {
      (extracted as Record<string, unknown>)[question.field] = value;
    }
  }

  return extracted;
}

function parseAnswer(
  field: keyof PartialUserFinancialData,
  answer: string,
): string | number | undefined {
  const question = SCOPED_QUESTIONS.find((q) => q.field === field);
  const trimmed = answer.trim();

  if (question?.quickReplies) {
    const match = question.quickReplies.find(
      (option) =>
        option.value === trimmed.toLowerCase() ||
        option.ar === trimmed ||
        option.en.toLowerCase() === trimmed.toLowerCase(),
    );
    return match?.value;
  }

  // "12,000 SAR" / "12000" → 12000. Anything without a number is not an answer.
  const numeric = Number(trimmed.replace(/[^\d.-]/g, ''));
  return Number.isFinite(numeric) && trimmed.length > 0 ? numeric : undefined;
}
