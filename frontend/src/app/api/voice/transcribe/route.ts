import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

/**
 * Server API route /api/voice/transcribe
 * Proxies STT requests to the Python backend.
 * The backend accepts { audio: <base64>, language } and returns
 * { text, language }.
 */

export async function POST(req: Request) {
  const body = await req.json();
  const { audio, language } = body as { audio?: string; language?: string };

  if (!audio) {
    return NextResponse.json({ error: "Missing audio" }, { status: 400 });
  }

  const { getToken } = await auth();
  const token = await getToken();
  const backendUrl = process.env.BACKEND_API_URL || "http://localhost:8000";

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);

    const res = await fetch(`${backendUrl}/voice/transcribe`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ audio, language: language || "en" }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (res.ok) {
      const data = await res.json();
      return NextResponse.json({
        text: data.text ?? "",
        language: data.language || language || "en",
      });
    }
  } catch {
    // Backend offline
  }

  return NextResponse.json({ error: "Backend unavailable" }, { status: 503 });
}
