type Msg = { role: "user" | "assistant"; content: string };

const CHAT_URL = "/api/chat";

export async function streamKalonChat({
  messages,
  onDelta,
  onDone,
  onError,
  onStage,
  clientPhone,
}: {
  messages: Msg[];
  onDelta: (deltaText: string) => void;
  onDone: () => void;
  onError: (error: string) => void;
  onStage?: (stage: string) => void;
  clientPhone?: string;
}) {
  try {
    const resp = await fetch(CHAT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ messages, clientPhone }),
    });

    if (!resp.ok) {
      if (resp.status === 429) {
        onError("Demasiadas solicitudes. Intenta de nuevo en unos segundos.");
        return;
      }
      if (resp.status === 402) {
        onError("Créditos de IA agotados.");
        return;
      }
      const errData = await resp.json().catch(() => ({}));
      onError(errData.error || "Error de conexión con KÂLON Estética");
      return;
    }

    if (!resp.body) {
      onError("No se recibió respuesta");
      return;
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let textBuffer = "";
    let streamDone = false;

    while (!streamDone) {
      const { done, value } = await reader.read();
      if (done) break;
      textBuffer += decoder.decode(value, { stream: true });

      let newlineIndex: number;
      while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
        let line = textBuffer.slice(0, newlineIndex);
        textBuffer = textBuffer.slice(newlineIndex + 1);

        if (line.endsWith("\r")) line = line.slice(0, -1);
        if (line.startsWith(":") || line.trim() === "") continue;
        if (!line.startsWith("data: ")) continue;

        const jsonStr = line.slice(6).trim();
        if (jsonStr === "[DONE]") {
          streamDone = true;
          break;
        }

        try {
          const parsed = JSON.parse(jsonStr);
          if (parsed.stage && onStage) onStage(parsed.stage);
          const content = parsed.choices?.[0]?.delta?.content as string | undefined;
          if (content) onDelta(content);
        } catch {
          textBuffer = line + "\n" + textBuffer;
          break;
        }
      }
    }

    // Final flush
    if (textBuffer.trim()) {
      for (let raw of textBuffer.split("\n")) {
        if (!raw) continue;
        if (raw.endsWith("\r")) raw = raw.slice(0, -1);
        if (raw.startsWith(":") || raw.trim() === "") continue;
        if (!raw.startsWith("data: ")) continue;
        const jsonStr = raw.slice(6).trim();
        if (jsonStr === "[DONE]") continue;
        try {
          const parsed = JSON.parse(jsonStr);
          if (parsed.stage && onStage) onStage(parsed.stage);
          const content = parsed.choices?.[0]?.delta?.content as string | undefined;
          if (content) onDelta(content);
        } catch {
          /* ignore */
        }
      }
    }

    onDone();
  } catch (e) {
    console.error("Stream error:", e);
    onError("Error de conexión. Intenta de nuevo.");
  }
}
