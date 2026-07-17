import { NextResponse } from "next/server";

/**
 * Proxy for the voice assistant → OpenRouter `openai/gpt-audio`.
 *
 * Exists so the OpenRouter API key stays on the server (env `OPENROUTER_API_KEY`) — the
 * browser only ever talks to this route. The client sends the full OpenAI-style message
 * history (user turns may carry base64-WAV `input_audio` parts) plus optional `tools`.
 *
 * OpenAI only allows audio output with `stream: true`, and streamed audio only as raw
 * `pcm16` — so this route consumes the whole SSE stream, stitches the PCM chunks into a
 * playable WAV (24 kHz mono, the model's output rate), and hands the client one flat JSON:
 * `{ text, audio, toolArgs }` — transcript, base64 WAV, and the arguments of a
 * `submit_answers` tool call if the agent made one.
 */

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const OUTPUT_SAMPLE_RATE = 24000;

/** Audio in + audio out makes for slow turns; give the upstream stream room to finish. */
export const maxDuration = 60;

interface StreamDelta {
  content?: string | null;
  audio?: { data?: string; transcript?: string } | null;
  tool_calls?: { index?: number; function?: { name?: string; arguments?: string } }[];
}

function wavFromPcm(pcm: Buffer, rate: number): Buffer {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + pcm.length, 4);
  h.write("WAVE", 8);
  h.write("fmt ", 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); // PCM
  h.writeUInt16LE(1, 22); // mono
  h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28); // byte rate
  h.writeUInt16LE(2, 32); // block align
  h.writeUInt16LE(16, 34); // bits per sample
  h.write("data", 36);
  h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

export async function POST(req: Request) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "OPENROUTER_API_KEY is not set on the server." },
      { status: 500 },
    );
  }

  let messages: unknown;
  let tools: unknown;
  try {
    ({ messages, tools } = await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: "`messages` must be a non-empty array." }, { status: 400 });
  }

  const upstream = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "openai/gpt-audio",
      stream: true,
      modalities: ["text", "audio"],
      // "cedar" is one of the two newest, most natural voices the API offers (the app-only
      // "Sol" voice does not exist in the API); the Sol-like character comes from the prompt.
      audio: { voice: "cedar", format: "pcm16" },
      messages,
      ...(Array.isArray(tools) && tools.length > 0 ? { tools } : {}),
    }),
  });

  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => "");
    return NextResponse.json(
      { error: `OpenRouter request failed (${upstream.status}). ${detail.slice(0, 300)}` },
      { status: 502 },
    );
  }

  let content = "";
  let transcript = "";
  let toolArgs = "";
  let toolName = "";
  let upstreamError: string | null = null;
  const pcm: Buffer[] = [];

  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });

    let nl;
    while ((nl = buf.indexOf("\n")) !== -1) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line.startsWith("data: ") || line === "data: [DONE]") continue;

      let event: {
        choices?: { delta?: StreamDelta }[];
        error?: { message?: string };
      };
      try {
        event = JSON.parse(line.slice(6));
      } catch {
        continue;
      }
      if (event.error?.message) upstreamError = event.error.message;

      const delta = event.choices?.[0]?.delta;
      if (!delta) continue;
      if (typeof delta.content === "string") content += delta.content;
      if (delta.audio?.transcript) transcript += delta.audio.transcript;
      if (delta.audio?.data) pcm.push(Buffer.from(delta.audio.data, "base64"));
      for (const call of delta.tool_calls ?? []) {
        if (call.function?.name) toolName = call.function.name;
        if (call.function?.arguments) toolArgs += call.function.arguments;
      }
    }
  }

  if (upstreamError && !transcript && !content && !toolArgs) {
    return NextResponse.json({ error: upstreamError }, { status: 502 });
  }

  return NextResponse.json({
    text: transcript || content,
    audio: pcm.length > 0 ? wavFromPcm(Buffer.concat(pcm), OUTPUT_SAMPLE_RATE).toString("base64") : null,
    toolArgs: toolName === "submit_answers" && toolArgs ? toolArgs : null,
  });
}
