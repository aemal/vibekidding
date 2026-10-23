"use client";
import { useEffect, useState } from "react";
import { Button, Input } from "@heroui/react";
import { Check, RefreshCw, Trash2 } from "lucide-react";
import { api } from "./api";

type Provider = "openai" | "anthropic";
type ProviderInfo = {
  provider: Provider;
  configured: boolean;
  model: string | null;
  models: {
    id: string;
    label: string;
    capability: "text-generation" | "unverified";
  }[];
  modelsCheckedAt?: string;
};
type Settings = {
  providers: ProviderInfo[];
  selectedProvider: Provider | null;
  voice?: { configured: boolean; agentId: string | null };
};
export function ProviderSettings({ onClose }: { onClose(): void }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  async function load() {
    setLoading(true);
    setError("");
    try {
      setSettings(await api<Settings>("/api/v2/providers"));
    } catch {
      setError("Could not load your AI settings. Please try again.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    let live = true;
    api<Settings>("/api/v2/providers")
      .then((response) => {
        if (live) setSettings(response);
      })
      .catch(() => {
        if (live)
          setError("Could not load your AI settings. Please try again.");
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, []);
  return (
    <section className="v2-provider-settings">
      <Button variant="ghost" onPress={onClose}>
        Back to workspace
      </Button>
      <span className="v2-eyebrow">YOUR FAMILY’S CONNECTIONS</span>
      <h1>AI settings</h1>
      <p>
        Connect your own API account for app generation. ChatGPT and Claude
        subscription logins are separate from API keys and API billing. Saved
        keys stay on the server and are never shown here.
      </p>
      {error && (
        <p className="v2-error" role="alert">
          {error}
        </p>
      )}
      <Button variant="ghost" isDisabled={loading} onPress={() => void load()}>
        <RefreshCw size={16} />
        {loading ? "Loading settings…" : "Reload settings"}
      </Button>
      {settings?.providers.map((info) => (
        <ProviderCard
          key={info.provider}
          info={info}
          selected={settings.selectedProvider === info.provider}
          update={setSettings}
        />
      ))}
      {settings && (
        <VoiceProviderCard
          info={settings.voice ?? { configured: false, agentId: null }}
          update={setSettings}
        />
      )}
    </section>
  );
}
function ProviderCard({
  info,
  selected,
  update,
}: {
  info: ProviderInfo;
  selected: boolean;
  update(settings: Settings): void;
}) {
  const [key, setKey] = useState("");
  const [model, setModel] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [confirmRemove, setConfirmRemove] = useState(false);
  const currentModel = model ?? info.model ?? "";
  async function request(action: "key" | "models" | "select" | "remove") {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await api<Settings>(
        action === "models" ? "/api/v2/providers/models" : "/api/v2/providers",
        {
          method: action === "models" ? "POST" : "PUT",
          body: JSON.stringify({
            provider: info.provider,
            ...(action === "key"
              ? { apiKey: key.trim() }
              : action === "select"
                ? { model: currentModel, select: true }
                : action === "remove"
                  ? { remove: true }
                  : {}),
          }),
        },
      );
      update(response);
      if (action === "key" || action === "remove") setKey("");
      if (action === "remove") {
        setModel(null);
        setConfirmRemove(false);
      }
      setMessage(
        action === "key"
          ? "API key saved. Refresh models to check what this account can access."
          : action === "models"
            ? "Model list refreshed from your provider account."
            : action === "select"
              ? "Generation provider and model saved. New requests will use this selection."
              : "Provider key removed.",
      );
    } catch {
      setError(
        action === "models"
          ? "Could not retrieve account models. Check the saved API key, provider access, and connection. No models are available yet."
          : "Could not save this setting. Check your input and connection, then try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className="v2-provider-card">
      <div className="v2-share-heading">
        <h2>{info.provider === "openai" ? "OpenAI" : "Anthropic"}</h2>
        {selected && (
          <span className="v2-provider-active">
            <Check size={15} /> Selected for generation
          </span>
        )}
      </div>
      <p>
        {info.configured
          ? "API key configured · value hidden"
          : "No API key configured"}
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void request("key");
        }}
      >
        <label htmlFor={`provider-key-${info.provider}`}>
          {info.configured ? "Replace API key" : "API key"}
        </label>
        <Input
          id={`provider-key-${info.provider}`}
          type="password"
          autoComplete="off"
          value={key}
          onChange={(event) => setKey(event.target.value)}
          disabled={busy}
          required
          maxLength={8192}
          placeholder="Paste an API key"
        />
        <Button type="submit" isDisabled={busy || !key.trim()}>
          Save API key
        </Button>
      </form>
      <div className="v2-provider-model">
        <label htmlFor={`provider-model-${info.provider}`}>
          Generation model
        </label>
        <select
          id={`provider-model-${info.provider}`}
          value={currentModel}
          onChange={(event) => setModel(event.target.value)}
          disabled={busy || !info.configured}
        >
          <option value="">Choose a model from your account</option>
          {info.model &&
            !info.models.some((item) => item.id === info.model) && (
              <option value={info.model}>{info.model} (saved selection)</option>
            )}
          {info.models.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
              {item.capability === "unverified"
                ? " · capability unverified"
                : ""}
            </option>
          ))}
        </select>
        <p>
          Provider model listings may include models that cannot generate app
          code. A successful model lookup does not verify a paid generation
          request.
        </p>
        <div className="v2-provider-actions">
          <Button
            variant="secondary"
            isDisabled={busy || !info.configured}
            onPress={() => void request("models")}
          >
            <RefreshCw size={15} /> Refresh account models
          </Button>
          <Button
            isDisabled={busy || !info.configured || !currentModel}
            onPress={() => void request("select")}
          >
            Use this model
          </Button>
        </div>
      </div>
      {message && <p role="status">{message}</p>}
      {error && (
        <p className="v2-error" role="alert">
          {error}
        </p>
      )}
      {info.configured && (
        <div className="v2-provider-remove">
          {confirmRemove ? (
            <>
              <p>
                Remove this API key? New requests using it will stop working.
              </p>
              <Button isDisabled={busy} onPress={() => void request("remove")}>
                Remove key
              </Button>
              <Button
                variant="ghost"
                isDisabled={busy}
                onPress={() => setConfirmRemove(false)}
              >
                Cancel
              </Button>
            </>
          ) : (
            <Button
              variant="ghost"
              isDisabled={busy}
              onPress={() => setConfirmRemove(true)}
            >
              <Trash2 size={15} /> Remove API key
            </Button>
          )}
        </div>
      )}
    </article>
  );
}

function VoiceProviderCard({
  info,
  update,
}: {
  info: { configured: boolean; agentId: string | null };
  update(settings: Settings): void;
}) {
  const [key, setKey] = useState("");
  const [agent, setAgent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const agentId = agent ?? info.agentId ?? "";
  async function save(remove = false) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await api<Settings>("/api/v2/providers", {
        method: "PUT",
        body: JSON.stringify({
          provider: "elevenlabs",
          ...(remove
            ? { remove: true }
            : {
                agentId: agentId.trim(),
                ...(key.trim() ? { apiKey: key.trim() } : {}),
              }),
        }),
      });
      update(response);
      setKey("");
      setAgent(null);
      setConfirmRemove(false);
      setNotice(
        remove
          ? "Voice connection removed."
          : "Voice settings saved. Start Samantha to check the connection; saving alone does not verify the agent or available credits.",
      );
    } catch {
      setError(
        "Could not save voice settings. Check your API key, agent ID, and connection, then try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className="v2-provider-card">
      <h2>ElevenLabs · Samantha voice</h2>
      <p>
        {info.configured
          ? "API key configured · value hidden"
          : "No API key configured"}
        . Connect your own ElevenLabs conversational agent. Voice usage is
        billed by your provider.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <label htmlFor="voice-provider-key">
          {info.configured
            ? "Replace API key (leave blank to keep it)"
            : "API key"}
        </label>
        <Input
          id="voice-provider-key"
          type="password"
          autoComplete="off"
          value={key}
          onChange={(event) => setKey(event.target.value)}
          disabled={busy}
          maxLength={8192}
          required={!info.configured}
        />
        <label htmlFor="voice-provider-agent">Agent ID</label>
        <Input
          id="voice-provider-agent"
          value={agentId}
          onChange={(event) => setAgent(event.target.value)}
          disabled={busy}
          required
          maxLength={256}
          placeholder="agent_…"
        />
        <Button
          type="submit"
          isDisabled={
            busy || !agentId.trim() || (!info.configured && !key.trim())
          }
        >
          Save voice settings
        </Button>
      </form>
      {notice && <p role="status">{notice}</p>}
      {error && (
        <p className="v2-error" role="alert">
          {error}
        </p>
      )}
      {info.configured && (
        <div className="v2-provider-remove">
          {confirmRemove ? (
            <>
              <p>Remove this voice connection?</p>
              <Button isDisabled={busy} onPress={() => void save(true)}>
                Remove voice key
              </Button>
              <Button
                variant="ghost"
                isDisabled={busy}
                onPress={() => setConfirmRemove(false)}
              >
                Cancel
              </Button>
            </>
          ) : (
            <Button
              variant="ghost"
              isDisabled={busy}
              onPress={() => setConfirmRemove(true)}
            >
              <Trash2 size={15} /> Remove voice connection
            </Button>
          )}
        </div>
      )}
    </article>
  );
}
