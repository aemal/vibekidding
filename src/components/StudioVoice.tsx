"use client";
import { useEffect, useRef, useState } from "react";
import { ConversationProvider, useConversation } from "@elevenlabs/react";
import { Mic, PhoneOff } from "lucide-react";
import { call } from "@/lib/studio/browser";
// Client integration is deliberately behind the closed /voice gate until the
// server-owned relay is available. A browser timer is never a billing control.
export function StudioVoice({
  onIdea,
  onError,
}: {
  onIdea: (idea: string) => void;
  onError: (message: string) => void;
}) {
  return (
    <ConversationProvider>
      <Controls onIdea={onIdea} onError={onError} />
    </ConversationProvider>
  );
}
function Controls({
  onIdea,
  onError,
}: {
  onIdea: (idea: string) => void;
  onError: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const starting = useRef(false);
  const conversation = useConversation({
    onError: () =>
      onError("Voice stopped. Your project is safe; you can keep typing."),
    clientTools: {
      propose_project: async (parameters: { idea?: string }) => {
        if (
          typeof parameters.idea !== "string" ||
          parameters.idea.length > 3000
        )
          return "Please suggest a short project idea.";
        onIdea(parameters.idea);
        return "The idea is in the editor. Ask the builder to review it and click Build when ready.";
      },
    },
  });
  const stop = useRef(conversation.endSession);
  useEffect(() => {
    stop.current = conversation.endSession;
  }, [conversation.endSession]);
  useEffect(
    () => () => {
      void stop.current();
    },
    [],
  );
  async function start() {
    if (starting.current) return;
    starting.current = true;
    setBusy(true);
    try {
      const session = await call("voice", {});
      // Only a future server-owned, one-use relay URL is accepted, never a direct ElevenLabs signed URL.
      const relay = new URL(session.relayUrl);
      if (relay.origin !== window.location.origin.replace(/^http/, "ws"))
        throw new Error("Voice relay must belong to this studio.");
      await conversation.startSession({
        signedUrl: relay.toString(),
        connectionType: "websocket",
      });
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
      starting.current = false;
    }
  }
  return conversation.status === "connected" ? (
    <button onClick={() => conversation.endSession()}>
      <PhoneOff size={18} /> End voice
    </button>
  ) : (
    <button disabled={busy} onClick={start}>
      <Mic size={18} />
      {busy ? "Checking voice…" : "Talk · setup needed"}
    </button>
  );
}
