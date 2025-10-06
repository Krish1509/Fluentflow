import { NextRequest, NextResponse } from "next/server";

type DidRequestBody = {
  text?: string;
  source_url?: string;
  voice_id?: string; // optional override
};

const DEFAULT_SOURCE_URL =
  "https://create-images-results.d-id.com/DefaultImages/actor.jpg";
const DEFAULT_VOICE_ID = "en-US-JennyNeural"; // Microsoft voice commonly used in D-ID examples

type AuthHeaders = { [key: string]: string };

function buildAuthHeaders(
  opts: {
    studioApiKey?: string | null;
    basicAuth?: string | null;
  }
): AuthHeaders {
  const headers: AuthHeaders = { "Content-Type": "application/json" };
  if (opts.basicAuth && opts.basicAuth.trim()) {
    const v = opts.basicAuth.trim();
    headers["Authorization"] = v.startsWith("Basic ") ? v : `Basic ${v}`;
    return headers;
  }
  if (opts.studioApiKey && opts.studioApiKey.trim()) {
    headers["x-api-key"] = opts.studioApiKey.trim();
    return headers;
  }
  return headers;
}

async function createTalk(
  auth: { studioApiKey?: string | null; basicAuth?: string | null },
  text: string,
  sourceUrl: string,
  voiceId: string
) {
  const baseHeaders = buildAuthHeaders(auth);

  // Primary payload (per D-ID clips/talks API)
  const primaryBody = {
    script: {
      type: "text",
      input: text,
    },
    source_url: sourceUrl,
  } as const;

  // Secondary payload with explicit voice provider
  const secondaryBody = {
    script: {
      type: "text",
      input: text,
      provider: { type: "microsoft", voice_id: voiceId },
    },
    source_url: sourceUrl,
  } as const;

  const makeReqV1 = async (body: unknown) =>
    fetch("https://api.d-id.com/v1/talks", {
      method: "POST",
      headers: baseHeaders,
      body: JSON.stringify(body),
    });

  const makeReqLegacy = async (body: unknown) =>
    fetch("https://api.d-id.com/talks", {
      method: "POST",
      headers: baseHeaders,
      body: JSON.stringify(body),
    });

  let res = await makeReqV1(primaryBody);
  if (!res.ok) {
    const firstErr = await res.text();
    console.warn("D-ID v1 primary payload failed:", firstErr);
    // Retry with explicit provider on v1
    res = await makeReqV1(secondaryBody);
    if (!res.ok) {
      const secondErr = await res.text();
      console.warn("D-ID v1 secondary payload failed:", secondErr);
      // Fallback to legacy endpoint with primary body
      res = await makeReqLegacy(primaryBody);
      if (!res.ok) {
        const legacyErr1 = await res.text();
        console.warn("D-ID legacy primary failed:", legacyErr1);
        // Legacy with secondary body
        res = await makeReqLegacy(secondaryBody);
        if (!res.ok) {
          const legacyErr2 = await res.text();
          throw new Error(`D-ID create error: ${legacyErr2}`);
        }
      }
    }
  }

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`D-ID create error: ${detail}`);
  }

  return (await res.json()) as { id: string };
}

async function fetchTalkStatus(auth: { studioApiKey?: string | null; basicAuth?: string | null }, id: string) {
  let res = await fetch(`https://api.d-id.com/v1/talks/${id}`, {
    headers: buildAuthHeaders(auth),
  });
  if (!res.ok) {
    const err = await res.text();
    console.warn("D-ID v1 status failed:", err);
    res = await fetch(`https://api.d-id.com/talks/${id}`, {
      headers: buildAuthHeaders(auth),
    });
  }
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`D-ID status error: ${detail}`);
  }
  return (await res.json()) as {
    id: string;
    status: string;
    result_url?: string;
    error?: string;
  };
}

export async function POST(request: NextRequest) {
  try {
    const studioApiKey = process.env.DID_API_KEY || process.env.NEXT_PUBLIC_DID_API_KEY || null;
    const basicAuth = process.env.DID_BASIC_AUTH || null; // base64(apiKey:secret) or full "Basic xyz"
    console.log("DID auth present:", !!studioApiKey || !!basicAuth);
    if (!studioApiKey && !basicAuth) {
      console.error("Missing DID credentials: set DID_API_KEY (Studio) or DID_BASIC_AUTH (Basic)");
      return NextResponse.json(
        { error: "Missing D-ID credentials", detail: "Set DID_API_KEY or DID_BASIC_AUTH" },
        { status: 500 }
      );
    }

    const body = (await request.json()) as DidRequestBody;
    const text = body?.text?.trim();
    if (!text) {
      return NextResponse.json(
        { error: "Missing 'text'" },
        { status: 400 }
      );
    }

    const sourceUrl = body?.source_url?.trim() || DEFAULT_SOURCE_URL;
    const voiceId = body?.voice_id?.trim() || DEFAULT_VOICE_ID;

    console.log("Creating D-ID talk with text:", text.substring(0, 50) + "...");
    const { id } = await createTalk({ studioApiKey, basicAuth }, text, sourceUrl, voiceId);
    console.log("D-ID talk created with ID:", id);

    // Poll up to ~30s for completion
    const startedAt = Date.now();
    const timeoutMs = 30_000;
    const intervalMs = 1_200;
    let resultUrl: string | undefined;
    let lastStatus = "";
    while (Date.now() - startedAt < timeoutMs) {
      const s = await fetchTalkStatus({ studioApiKey, basicAuth }, id);
      lastStatus = s.status;
      if (s.status === "done" && s.result_url) {
        resultUrl = s.result_url;
        break;
      }
      if (s.status === "error") {
        return NextResponse.json(
          { error: "D-ID processing error", detail: s.error, id },
          { status: 502 }
        );
      }
      await new Promise((r) => setTimeout(r, intervalMs));
    }

    if (!resultUrl) {
      return NextResponse.json(
        { error: "Timeout waiting for video", id, status: lastStatus },
        { status: 504 }
      );
    }

    return NextResponse.json({ id, videoUrl: resultUrl });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: "Request failed", detail: String(error) },
      { status: 500 }
    );
  }
}


