export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
  cache_control?: { type: "ephemeral" };
};

export type ChatResult = {
  ok: boolean;
  status: number;
  rawText?: string;
  content?: string;
  emptyContent?: boolean;
};

export async function openRouterChat(params: {
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  timeoutMs: number;
  signal?: AbortSignal;
}): Promise<ChatResult> {
  const ctrl = new AbortController();
  const timeoutSignal =
    typeof AbortSignal !== "undefined" && "timeout" in AbortSignal
      ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (AbortSignal as any).timeout(params.timeoutMs)
      : null;
  const timeoutId =
    !timeoutSignal ? setTimeout(() => ctrl.abort(), params.timeoutMs) : null;
  if (params.signal) {
    if (params.signal.aborted) ctrl.abort();
    else params.signal.addEventListener("abort", () => ctrl.abort(), { once: true });
  }
  const signal =
    timeoutSignal && typeof AbortSignal !== "undefined" && "any" in AbortSignal
      ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (AbortSignal as any).any([ctrl.signal, timeoutSignal])
      : ctrl.signal;

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${params.apiKey}`,
        "HTTP-Referer": "http://localhost:3000",
        "X-Title": "Upwork Job Evaluator",
      },
      body: JSON.stringify({
        model: params.model,
        messages: params.messages,
      }),
      signal,
    });

    if (ctrl.signal.aborted) {
      return { ok: false, status: 504, rawText: "timeout", emptyContent: false };
    }
    const rawText = await res.text();
    if (!res.ok) {
      return { ok: false, status: res.status, rawText };
    }

    let payload: unknown;
    try {
      payload = JSON.parse(rawText);
    } catch {
      return { ok: false, status: 502, rawText };
    }

    const p = payload as {
      choices?: { message?: { content?: string; reasoning?: string; text?: string } }[];
    };
    const msg = p.choices?.[0]?.message;
    const content =
      (typeof msg?.content === "string" ? msg.content : undefined) ??
      (typeof msg?.text === "string" ? msg.text : undefined) ??
      (typeof msg?.reasoning === "string" ? msg.reasoning : undefined);
    if (typeof content !== "string" || !content.trim()) {
      console.error("OpenRouter empty content payload:", payload);
      return { ok: false, status: 502, rawText, emptyContent: true };
    }
    return { ok: true, status: 200, content };
  } catch (e) {
    const aborted = e && typeof e === "object" && "name" in e && (e as { name: unknown }).name === "AbortError";
    return { ok: false, status: aborted ? 504 : 502, rawText: aborted ? "timeout" : String(e) };
  } finally {
    ctrl.abort();
    if (timeoutId) clearTimeout(timeoutId);
  }
}
