import type { ChatMessage, LLMProvider, LLMTurn } from '@shared/types';
import { ChatService } from '@/modules/chat/application/chat.service';
import { MockLLMProvider } from '@/modules/chat/infrastructure/mock-llm.provider';
import { REQUIRED_FIELDS } from '@/modules/chat/domain/questions';
import { mergeExtracted, missingRequiredFields } from '@/modules/chat/domain/extraction';
import { FakeAnalysisRepository, FakeChatRepository, FakeGosiProvider, FakeSimahProvider } from '../fakes';

const USER_ID = '11111111-1111-4111-8111-111111111111';

/** An LLM that says exactly what the test tells it to. */
class ScriptedLLM implements LLMProvider {
  constructor(private readonly turns: LLMTurn[]) {}
  readonly seen: ChatMessage[][] = [];

  async next(messages: ChatMessage[]): Promise<LLMTurn> {
    this.seen.push(messages);
    return this.turns.shift() ?? { reply: 'done', extracted: {}, complete: true };
  }
}

function build(llm: LLMProvider) {
  const chatRepository = new FakeChatRepository();
  const analysisRepository = new FakeAnalysisRepository();
  return {
    service: new ChatService(llm, chatRepository, analysisRepository),
    chatRepository,
    analysisRepository,
  };
}

describe('the ten scoped questions', () => {
  it('asks for exactly the fields UserFinancialData requires — no more, no less', () => {
    expect([...REQUIRED_FIELDS].sort()).toEqual(
      [
        'additionalIncome',
        'employmentSector',
        'existingCommitments',
        'familyStatus',
        'financingAmount',
        'goal',
        'grossSalary',
        'monthlyExpenses',
        'savings',
        'tenureYears',
        'termYears',
      ].sort(),
    );
  });
});

describe('merging what the chat has collected', () => {
  it('never lets a forgetful model un-collect a value it already gave us', () => {
    const merged = mergeExtracted({ grossSalary: 12_000 }, { monthlyExpenses: 5_000 });

    expect(merged).toEqual({ grossSalary: 12_000, monthlyExpenses: 5_000 });
  });

  it('lets the user correct themselves', () => {
    expect(mergeExtracted({ grossSalary: 12_000 }, { grossSalary: 14_000 })).toEqual({
      grossSalary: 14_000,
    });
  });
});

describe('ChatService — the LLM trust boundary', () => {
  it('persists what the model extracted, once Zod agrees with it', async () => {
    const { service, chatRepository } = build(
      new ScriptedLLM([
        { reply: 'كم راتبك؟', extracted: { goal: 'car', financingAmount: 150_000 }, complete: false },
      ]),
    );

    const { chatSessionId } = await service.start(USER_ID);
    const turn = await service.sendMessage(USER_ID, chatSessionId, 'أبغى تمويل سيارة بـ ١٥٠ ألف');

    expect(turn.extracted).toEqual({ goal: 'car', financingAmount: 150_000 });
    expect(turn.complete).toBe(false);
    expect(turn.progress).toEqual({ collected: 2, total: 11 });
    expect(chatRepository.sessions.get(chatSessionId)!.extracted).toEqual(turn.extracted);
  });

  it('DISCARDS an extraction the model hallucinated a field into, rather than storing it', async () => {
    const { service, chatRepository } = build(
      new ScriptedLLM([
        {
          reply: 'ok',
          // `creditScore` is not in the contract. A strict schema rejects the whole object rather
          // than silently dropping the unknown key.
          extracted: { grossSalary: 12_000, creditScore: 720 } as never,
          complete: false,
        },
      ]),
    );

    const { chatSessionId } = await service.start(USER_ID);
    const turn = await service.sendMessage(USER_ID, chatSessionId, 'راتبي ١٢ ألف');

    expect(turn.extracted).toEqual({});
    expect(chatRepository.sessions.get(chatSessionId)!.extracted).toEqual({});
  });

  it('DISCARDS an out-of-bounds value — a model cannot talk a 10-billion-riyal salary into the DB', async () => {
    const { service } = build(
      new ScriptedLLM([
        { reply: 'ok', extracted: { grossSalary: 10_000_000_000 }, complete: false },
      ]),
    );

    const { chatSessionId } = await service.start(USER_ID);
    const turn = await service.sendMessage(USER_ID, chatSessionId, 'راتبي كثير');

    expect(turn.extracted).toEqual({});
  });

  it('does not take the model\'s word for "complete" — it checks the data itself', async () => {
    const { service, analysisRepository } = build(
      new ScriptedLLM([
        // The model declares victory holding two fields out of eleven.
        { reply: 'تم!', extracted: { goal: 'car', grossSalary: 12_000 }, complete: true },
      ]),
    );

    const { chatSessionId } = await service.start(USER_ID);
    const turn = await service.sendMessage(USER_ID, chatSessionId, 'خلاص');

    expect(turn.complete).toBe(false);
    expect(turn.financialInputId).toBeUndefined();
    // And crucially: nothing was handed to the SAMA engine.
    expect(analysisRepository.inputs.size).toBe(0);
  });

  it('freezes the collected data into a financial input once it is genuinely complete', async () => {
    const complete = {
      goal: 'car' as const,
      financingAmount: 150_000,
      termYears: 5,
      grossSalary: 12_000,
      additionalIncome: 0,
      existingCommitments: 0,
      monthlyExpenses: 5_000,
      familyStatus: 'married' as const,
      savings: 20_000,
      employmentSector: 'private' as const,
      tenureYears: 4,
    };

    const { service, analysisRepository } = build(
      new ScriptedLLM([{ reply: 'شكراً، اكتملت بياناتك.', extracted: complete, complete: true }]),
    );

    const { chatSessionId } = await service.start(USER_ID);
    const turn = await service.sendMessage(USER_ID, chatSessionId, 'أربع سنوات');

    expect(turn.complete).toBe(true);
    expect(turn.financialInputId).toBeDefined();
    expect(missingRequiredFields(turn.extracted)).toHaveLength(0);

    const stored = analysisRepository.inputs.get(turn.financialInputId!)!;
    expect(stored.source).toBe('chatbot');
    expect(stored.input).toEqual(complete);
  });

  it('never sends the model a system turn through the transcript', async () => {
    const llm = new ScriptedLLM([{ reply: 'ok', extracted: {}, complete: false }]);
    const { service } = build(llm);

    const { chatSessionId } = await service.start(USER_ID);
    await service.sendMessage(USER_ID, chatSessionId, 'hello');

    expect(llm.seen[0]!.every((m) => m.role !== 'system')).toBe(true);
  });

  it('keeps the whole transcript, in order — it is the audit trail', async () => {
    const { service, chatRepository } = build(
      new ScriptedLLM([
        { reply: 'كم المبلغ؟', extracted: { goal: 'car' }, complete: false },
        { reply: 'كم راتبك؟', extracted: { financingAmount: 150_000 }, complete: false },
      ]),
    );

    const { chatSessionId } = await service.start(USER_ID);
    await service.sendMessage(USER_ID, chatSessionId, 'سيارة');
    await service.sendMessage(USER_ID, chatSessionId, '150000');

    const transcript = chatRepository.sessions.get(chatSessionId)!.transcript;
    expect(transcript.map((m) => m.role)).toEqual(['user', 'assistant', 'user', 'assistant']);
    expect(transcript[0]!.content).toBe('سيارة');
    // And the accumulated extraction spans both turns.
    expect(chatRepository.sessions.get(chatSessionId)!.extracted).toEqual({
      goal: 'car',
      financingAmount: 150_000,
    });
  });

  it('refuses to reopen a completed conversation', async () => {
    const { service, chatRepository } = build(new MockLLMProvider());
    const { chatSessionId } = await service.start(USER_ID);

    const session = chatRepository.sessions.get(chatSessionId)!;
    chatRepository.sessions.set(chatSessionId, { ...session, complete: true });

    await expect(service.sendMessage(USER_ID, chatSessionId, 'more')).rejects.toMatchObject({
      status: 400,
    });
  });

  it('will not let one user read another user\'s conversation', async () => {
    const { service } = build(new MockLLMProvider());
    const { chatSessionId } = await service.start(USER_ID);

    await expect(
      service.get('22222222-2222-4222-8222-222222222222', chatSessionId),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe('the mock LLM provider (LLM_PROVIDER=mock)', () => {
  it('walks the ten questions and collects a complete, valid dataset', async () => {
    const { service, analysisRepository } = build(new MockLLMProvider());
    const { chatSessionId } = await service.start(USER_ID);

    const answers = [
      'car',
      '150000',
      '5',
      '12000',
      '0',
      '0',
      '5000',
      'married',
      '20000',
      'private',
      '4',
    ];

    let turn = await service.get(USER_ID, chatSessionId);
    for (const answer of answers) {
      turn = await service.sendMessage(USER_ID, chatSessionId, answer);
    }

    expect(turn.complete).toBe(true);
    expect(turn.financialInputId).toBeDefined();
    expect(analysisRepository.inputs.get(turn.financialInputId!)!.input).toEqual({
      goal: 'car',
      financingAmount: 150_000,
      termYears: 5,
      grossSalary: 12_000,
      additionalIncome: 0,
      existingCommitments: 0,
      monthlyExpenses: 5_000,
      familyStatus: 'married',
      savings: 20_000,
      employmentSector: 'private',
      tenureYears: 4,
    });
  });
});

describe('auto-pull: GOSI income + SIMAH obligations replace the asked questions', () => {
  const USER = USER_ID;

  /** The seven Tier-B fields — everything the chat still asks once salary/obligations are pulled. */
  const TIER_B = {
    goal: 'car' as const,
    financingAmount: 150_000,
    termYears: 5,
    additionalIncome: 0,
    monthlyExpenses: 5_000,
    familyStatus: 'married' as const,
    savings: 20_000,
  };

  function buildWithPull(llm: LLMProvider, opts: { gosiOn: boolean; simahOn: boolean }) {
    const chatRepository = new FakeChatRepository();
    const analysisRepository = new FakeAnalysisRepository();
    const gosi = new FakeGosiProvider();
    const simah = new FakeSimahProvider();
    const service = new ChatService(llm, chatRepository, analysisRepository, {
      gosi,
      simah,
      isGosiEnabled: async () => opts.gosiOn,
      isSimahEnabled: async () => opts.simahOn,
    });
    return { service, chatRepository, analysisRepository, gosi, simah };
  }

  it('completes on the Tier-B fields alone and fills salary/sector/tenure/obligations from the sources', async () => {
    const llm = new ScriptedLLM([{ reply: 'تم', extracted: TIER_B, complete: true }]);
    const { service, analysisRepository, gosi, simah } = buildWithPull(llm, {
      gosiOn: true,
      simahOn: true,
    });

    const { chatSessionId } = await service.start(USER);
    const turn = await service.sendMessage(USER, chatSessionId, 'كل بياناتي');

    // The chat asked only 7 fields, yet the run is complete — the pull supplied the other 4.
    expect(turn.progress.total).toBe(7);
    expect(turn.complete).toBe(true);
    expect(turn.financialInputId).toBeDefined();

    // The persisted, engine-ready input carries the pulled figures.
    expect(analysisRepository.inputs.get(turn.financialInputId!)!.input).toEqual({
      ...TIER_B,
      grossSalary: 15_000, // GOSI contributionWage
      employmentSector: 'private', // GOSI sector
      tenureYears: 4, // GOSI serviceMonths (48) / 12
      existingCommitments: 1_850, // SIMAH totalMonthlyInstallments
    });

    expect(gosi.calls).toHaveLength(1);
    expect(simah.calls).toHaveLength(1);
  });

  it('with both flags off, the same Tier-B-only data is NOT complete — the four fields are still asked', async () => {
    const llm = new ScriptedLLM([{ reply: 'ناقص', extracted: TIER_B, complete: true }]);
    const { service, gosi, simah } = buildWithPull(llm, { gosiOn: false, simahOn: false });

    const { chatSessionId } = await service.start(USER);
    const turn = await service.sendMessage(USER, chatSessionId, 'كل بياناتي');

    expect(turn.progress.total).toBe(11); // legacy: all fields asked
    expect(turn.complete).toBe(false);
    expect(turn.financialInputId).toBeUndefined();
    expect(gosi.calls).toHaveLength(0); // nothing pulled
    expect(simah.calls).toHaveLength(0);
  });

  it('gosi_income alone drops the three GOSI fields but still asks obligations', async () => {
    const llm = new ScriptedLLM([{ reply: 'x', extracted: TIER_B, complete: true }]);
    const { service } = buildWithPull(llm, { gosiOn: true, simahOn: false });

    const { chatSessionId } = await service.start(USER);
    const turn = await service.sendMessage(USER, chatSessionId, 'بياناتي');

    // 11 − 3 (GOSI) = 8 asked; existingCommitments is NOT provided in TIER_B, so still incomplete.
    expect(turn.progress.total).toBe(8);
    expect(turn.complete).toBe(false);
  });
});
