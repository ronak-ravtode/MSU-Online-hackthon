import { NextResponse } from "next/server";

/**
 * Server API route /api/grievance/answer
 * Proxies to POST /grievances/answer on the Python backend.
 */
export async function POST(req: Request) {
  let body: { conversation_id?: string; field?: string; value?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const backendUrl = process.env.BACKEND_API_URL || "http://localhost:8000";

  try {
    const res = await fetch(`${backendUrl}/grievances/answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      return NextResponse.json(await res.json());
    }
    return NextResponse.json(
      { error: "grievance_backend_error", detail: `backend responded ${res.status}` },
      { status: 502 },
    );
  } catch {
    return NextResponse.json(
      { error: "grievance_backend_unavailable", detail: "backend unreachable" },
      { status: 503 },
    );
  }
}
