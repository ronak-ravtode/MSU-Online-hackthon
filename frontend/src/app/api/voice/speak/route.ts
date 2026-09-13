import { NextResponse } from "next/server";

/**
 * Server API route /api/voice/speak
 * Proxies segment-based TTS requests to the Python backend.
 * The backend accepts { text, language } or { segments: [{ text, language }] }
 * and returns { audio: "<hex>", language: "<lang>" }.
 */

export async function POST(req: Request) {
  const body = await req.json();
  const { segments } = body as { segments?: { text: string; language: string }[] };

  if (!segments || segments.length === 0) {
    return NextResponse.json({ error: "Missing segments" }, { status: 400 });
  }

  const backendUrl = process.env.BACKEND_API_URL || "http://localhost:8000";

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);

    const res = await fetch(`${backendUrl}/voice/speak`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ segments }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (res.ok) {
      const data = await res.json();
      if (data.audio) {
        return NextResponse.json({ audio: data.audio, language: data.language || segments[0].language });
      }
    }
  } catch {
    // Backend offline
  }

  return NextResponse.json({ error: "Backend unavailable" }, { status: 503 });
}