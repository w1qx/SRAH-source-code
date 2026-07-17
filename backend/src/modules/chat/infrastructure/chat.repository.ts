import type { Prisma } from '@prisma/client';
import type { ChatMessage, PartialUserFinancialData } from '@shared/types';
import type { Db } from '@/db/prisma';

/**
 * chat_sessions (Scope v2 §11): the transcript is an audit record. What the user was ASKED is
 * part of how their data came to be what it is — and in a regulated product, that matters.
 */
export interface ChatSessionRecord {
  id: string;
  userId: string;
  transcript: ChatMessage[];
  extracted: PartialUserFinancialData;
  complete: boolean;
  extractedInputId: string | null;
  createdAt: string;
}

export interface ChatRepository {
  create(userId: string): Promise<ChatSessionRecord>;
  findById(userId: string, id: string): Promise<ChatSessionRecord | undefined>;
  update(
    id: string,
    data: {
      transcript: ChatMessage[];
      extracted: PartialUserFinancialData;
      complete: boolean;
      extractedInputId?: string;
    },
  ): Promise<ChatSessionRecord>;
}

export class PrismaChatRepository implements ChatRepository {
  constructor(private readonly db: Db) {}

  async create(userId: string): Promise<ChatSessionRecord> {
    const row = await this.db.chatSession.create({ data: { userId } });
    return toRecord(row);
  }

  async findById(userId: string, id: string): Promise<ChatSessionRecord | undefined> {
    const row = await this.db.chatSession.findFirst({ where: { id, userId } });
    return row ? toRecord(row) : undefined;
  }

  async update(
    id: string,
    data: {
      transcript: ChatMessage[];
      extracted: PartialUserFinancialData;
      complete: boolean;
      extractedInputId?: string;
    },
  ): Promise<ChatSessionRecord> {
    const row = await this.db.chatSession.update({
      where: { id },
      data: {
        transcriptJson: data.transcript as unknown as Prisma.InputJsonValue,
        extractedJson: data.extracted as unknown as Prisma.InputJsonValue,
        complete: data.complete,
        ...(data.extractedInputId ? { extractedInputId: data.extractedInputId } : {}),
      },
    });
    return toRecord(row);
  }
}

function toRecord(row: {
  id: string;
  userId: string;
  transcriptJson: Prisma.JsonValue;
  extractedJson: Prisma.JsonValue;
  complete: boolean;
  extractedInputId: string | null;
  createdAt: Date;
}): ChatSessionRecord {
  return {
    id: row.id,
    userId: row.userId,
    transcript: (row.transcriptJson as unknown as ChatMessage[]) ?? [],
    extracted: (row.extractedJson as unknown as PartialUserFinancialData) ?? {},
    complete: row.complete,
    extractedInputId: row.extractedInputId,
    createdAt: row.createdAt.toISOString(),
  };
}
