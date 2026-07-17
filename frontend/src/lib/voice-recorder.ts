"use client";

/**
 * Mic recorder for the voice assistant.
 *
 * Captures raw PCM through WebAudio instead of MediaRecorder — MediaRecorder's container
 * differs per browser (webm/opus in Chrome, mp4/aac in Safari), while `input_audio` wants
 * plain WAV. The take is downsampled to 16 kHz mono 16-bit and returned as base64.
 *
 * Hands-free: a small RMS voice-activity detector watches the take. Once the user has
 * spoken and then stays quiet for SILENCE_MS, `onAutoStop("silence")` fires so the caller
 * can send without a button press; if they never speak at all it fires with "timeout".
 */

/** Speech must clear this RMS level; calm rooms sit well below it. */
const SPEECH_RMS = 0.015;
/** How many voiced chunks (~85 ms each) before we believe speech started. */
const SPEECH_CHUNKS = 3;
/** Quiet gap after speech that ends the take. */
const SILENCE_MS = 1300;
/** Give up waiting for first speech after this long. */
const NO_SPEECH_TIMEOUT_MS = 15000;
/** Hard cap — send whatever we have. */
const MAX_TAKE_MS = 60000;

export class VoiceRecorder {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private chunks: Float32Array[] = [];

  constructor(private onAutoStop?: (reason: "silence" | "timeout") => void) {}

  get active(): boolean {
    return this.ctx !== null;
  }

  /** Asks for the mic and starts capturing. Throws if permission is denied. */
  async start(): Promise<void> {
    if (this.ctx) return;
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.ctx = new AudioContext();
    this.source = this.ctx.createMediaStreamSource(this.stream);
    this.processor = this.ctx.createScriptProcessor(4096, 1, 1);
    this.chunks = [];

    const chunkMs = (4096 / this.ctx.sampleRate) * 1000;
    let voicedChunks = 0;
    let heardSpeech = false;
    let silentMs = 0;
    let totalMs = 0;
    let fired = false;

    this.processor.onaudioprocess = (e) => {
      const data = e.inputBuffer.getChannelData(0);
      this.chunks.push(new Float32Array(data));

      let sum = 0;
      for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
      const rms = Math.sqrt(sum / data.length);

      totalMs += chunkMs;
      if (rms > SPEECH_RMS) {
        voicedChunks++;
        if (voicedChunks >= SPEECH_CHUNKS) heardSpeech = true;
        silentMs = 0;
      } else {
        silentMs += chunkMs;
      }

      if (fired || !this.onAutoStop) return;
      if (heardSpeech && silentMs >= SILENCE_MS) {
        fired = true;
        this.onAutoStop("silence");
      } else if (!heardSpeech && totalMs >= NO_SPEECH_TIMEOUT_MS) {
        fired = true;
        this.onAutoStop("timeout");
      } else if (totalMs >= MAX_TAKE_MS) {
        fired = true;
        this.onAutoStop("silence");
      }
    };
    this.source.connect(this.processor);
    this.processor.connect(this.ctx.destination);
  }

  /** Stops the take and returns it as base64 WAV, or null when nothing was captured. */
  stop(): string | null {
    const ctx = this.ctx;
    if (!ctx) return null;
    const inputRate = ctx.sampleRate;
    const chunks = this.chunks;
    this.teardown();

    const total = chunks.reduce((n, c) => n + c.length, 0);
    if (total === 0) return null;
    const joined = new Float32Array(total);
    let offset = 0;
    for (const c of chunks) {
      joined.set(c, offset);
      offset += c.length;
    }
    return encodeWavBase64(downsample(joined, inputRate, 16000), 16000);
  }

  /** Drops the take without producing audio (orb closed mid-recording). */
  cancel(): void {
    this.teardown();
  }

  private teardown(): void {
    this.processor?.disconnect();
    this.source?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    void this.ctx?.close();
    this.ctx = null;
    this.stream = null;
    this.source = null;
    this.processor = null;
    this.chunks = [];
  }
}

function downsample(input: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate <= toRate) return input;
  const ratio = fromRate / toRate;
  const out = new Float32Array(Math.floor(input.length / ratio));
  for (let i = 0; i < out.length; i++) {
    // Average the source window — a cheap low-pass so speech stays clear after decimation.
    const start = Math.floor(i * ratio);
    const end = Math.min(Math.floor((i + 1) * ratio), input.length);
    let sum = 0;
    for (let j = start; j < end; j++) sum += input[j];
    out[i] = end > start ? sum / (end - start) : 0;
  }
  return out;
}

function encodeWavBase64(samples: Float32Array, rate: number): string {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buf);
  const writeStr = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i));
  };

  writeStr(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeStr(36, "data");
  view.setUint32(40, samples.length * 2, true);

  let o = 44;
  for (let i = 0; i < samples.length; i++, o += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }

  // btoa over one giant string blows the call-argument limit — build it in slices.
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}
