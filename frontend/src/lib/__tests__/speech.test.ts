import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as api from "../api";
import { partitionRuns, hasVoice, pickVoice, speakSegments, createSpeechService } from "../speech";

// Minimal WAV hex (doesn't need to be valid audio for the test; we stub Audio).
const FAKE_HEX = "000000";

beforeEach(() => {
  vi.resetAllMocks();
  // Stub Audio so play() resolves and onended fires, letting playAzure settle.
  class StubAudio {
    onended: (() => void) | null = null;
    onerror: (() => void) | null = null;
    constructor(_src?: string) {
      void _src;
    }
    play() {
      Promise.resolve().then(() => this.onended?.());
      return Promise.resolve();
    }
  }
  (globalThis as unknown as { Audio: typeof StubAudio }).Audio = StubAudio;
});

describe("partitionRuns", () => {
  it("merges contiguous same-language segments", () => {
    const out = partitionRuns([
      { text: "Hello ", language: "en" },
      { text: "world", language: "en" },
      { text: "नमस्ते", language: "hi" },
    ]);
    expect(out).toEqual([
      { text: "Hello world", language: "en" },
      { text: "नमस्ते", language: "hi" },
    ]);
  });

  it("returns empty array for empty input", () => {
    expect(partitionRuns([])).toEqual([]);
  });
});

describe("hasVoice / pickVoice", () => {
  it("returns false/undefined when no speechSynthesis (jsdom/node)", () => {
    expect(hasVoice("en")).toBe(false);
    expect(pickVoice("hi")).toBeUndefined();
  });
});

describe("speakSegments", () => {
  it("falls back to Azure per run and resolves", async () => {
    const spy = vi
      .spyOn(api, "fetchVoiceSpeak")
      .mockResolvedValue({ audio: FAKE_HEX, language: "hi" });

    await speakSegments([{ text: "नमस्ते", language: "hi" }]);

    expect(spy).toHaveBeenCalledWith([{ text: "नमस्ते", language: "hi" }]);
  });

  it("uses Azure for each language run when no browser voice matches", async () => {
    const spy = vi
      .spyOn(api, "fetchVoiceSpeak")
      .mockResolvedValue({ audio: FAKE_HEX, language: "hi" });

    await speakSegments([
      { text: "Hello ", language: "en" },
      { text: "world", language: "en" },
      { text: "नमस्ते", language: "hi" },
    ]);

    // Two distinct runs (en, hi) => two Azure fetches.
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenCalledWith([{ text: "Hello world", language: "en" }]);
    expect(spy).toHaveBeenCalledWith([{ text: "नमस्ते", language: "hi" }]);
  });
});

describe("listen (Sarvam STT)", () => {
  const track = { stop: vi.fn() };
  const streamStub = { getTracks: () => [track] };

  class StubMediaRecorder {
    static instances: StubMediaRecorder[] = [];
    state = "inactive";
    ondataavailable: ((e: { data: Blob }) => void) | null = null;
    onstop: (() => void) | null = null;
    onerror: ((e: unknown) => void) | null = null;
    constructor(_stream: unknown) {
      StubMediaRecorder.instances.push(this);
    }
    start() {
      this.state = "recording";
    }
    stop() {
      if (this.state === "inactive") return;
      this.state = "inactive";
      this.ondataavailable?.({ data: new Blob(["audio-bytes"]) });
      this.onstop?.();
    }
  }

  beforeEach(() => {
    vi.resetAllMocks();
    StubMediaRecorder.instances = [];
    track.stop.mockClear();
    vi.stubGlobal("MediaRecorder", StubMediaRecorder);
    Object.defineProperty(globalThis.navigator, "mediaDevices", {
      value: { getUserMedia: vi.fn().mockResolvedValue(streamStub) },
      configurable: true,
      writable: true,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ text: "hello world", language: "en" }),
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis.navigator as any).mediaDevices;
  });

  it("records until stop, then transcribes via /api/voice/transcribe and delivers the text", async () => {
    const transcripts: string[] = [];
    const stop = createSpeechService().listen("en", (text) => {
      transcripts.push(text);
    });

    await vi.waitFor(() => {
      expect(StubMediaRecorder.instances.length).toBe(1);
      expect(StubMediaRecorder.instances[0].state).toBe("recording");
    });

    stop();

    await vi.waitFor(() => {
      expect(transcripts).toEqual(["hello world"]);
    });
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/voice/transcribe");
  });

  it("stops the microphone tracks after the session ends", async () => {
    const stop = createSpeechService().listen("en", () => {});
    await vi.waitFor(() => {
      expect(StubMediaRecorder.instances.length).toBe(1);
    });
    stop();

    await vi.waitFor(() => {
      expect(track.stop).toHaveBeenCalled();
    });
  });

  it("delivers an empty transcript (once) when stopped before recording starts", async () => {
    const transcripts: string[] = [];
    const stop = createSpeechService().listen("en", (text) => {
      transcripts.push(text);
    });
    stop();
    stop(); // second stop must be a no-op

    await vi.waitFor(() => {
      expect(transcripts).toEqual([""]);
    });
  });

  it("supported is true when MediaRecorder and getUserMedia exist", () => {
    expect(createSpeechService().supported).toBe(true);
    vi.stubGlobal("MediaRecorder", undefined);
    expect(createSpeechService().supported).toBe(false);
  });

  it("returns a noop stop when recording APIs are unavailable", () => {
    vi.stubGlobal("MediaRecorder", undefined);
    const stop = createSpeechService().listen("en", () => {
      throw new Error("onTranscript must not fire without recording APIs");
    });
    expect(() => stop()).not.toThrow();
  });
});

describe("speakSegments cancellation", () => {
  // Stub Audio whose play() resolves but whose onended NEVER fires — this
  // reproduces the dangling-promise bug where pause() does not settle the
  // awaiting playAzure promise.
  beforeEach(() => {
    vi.resetAllMocks();
    class NonEndingAudio {
      onended: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(_src?: string) {
        void _src;
      }
      play() {
        return Promise.resolve();
      }
    }
    (globalThis as unknown as { Audio: typeof NonEndingAudio }).Audio =
      NonEndingAudio;
  });

  it("settles the in-flight Azure promise when a newer call cancels it", async () => {
    vi.spyOn(api, "fetchVoiceSpeak").mockResolvedValue({
      audio: FAKE_HEX,
      language: "hi",
    });

    const first = speakSegments([{ text: "नमस्ते", language: "hi" }]);
    // Second call cancels the first via stopAllPlayback().
    speakSegments([{ text: "अलविदा", language: "hi" }]);

    await expect(first).resolves.toBeUndefined();
  });

  it("settles the in-flight Azure promise when stopSpeaking is called", async () => {
    vi.spyOn(api, "fetchVoiceSpeak").mockResolvedValue({
      audio: FAKE_HEX,
      language: "hi",
    });

    const first = speakSegments([{ text: "नमस्ते", language: "hi" }]);
    createSpeechService().stopSpeaking();

    await expect(first).resolves.toBeUndefined();
  });
});
