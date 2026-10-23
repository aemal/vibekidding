"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Button, Input } from "@heroui/react";
import {
  Check,
  KeyRound,
  LoaderCircle,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { api } from "./api";

type EnvironmentResponse = {
  variables: { name: string; configured: boolean }[];
};

/** Saved secret values never enter client state or the rendered page. */
export function ProjectEnvironment({
  projectId,
  disabled,
}: {
  projectId: string;
  disabled: boolean;
}) {
  const [variables, setVariables] = useState<EnvironmentResponse["variables"]>(
    [],
  );
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [removeName, setRemoveName] = useState<string | null>(null);
  const replacing = variables.some((variable) => variable.name === name.trim());
  const refresh = useCallback(async () => {
    const response = await api<EnvironmentResponse>(
      `/api/v2/projects/${encodeURIComponent(projectId)}/environment`,
    );
    setVariables(response.variables);
  }, [projectId]);

  useEffect(() => {
    let live = true;
    api<EnvironmentResponse>(
      `/api/v2/projects/${encodeURIComponent(projectId)}/environment`,
    )
      .then((response) => {
        if (live) setVariables(response.variables);
      })
      .catch(() => {
        if (live) setError("Could not load environment settings. Try again.");
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [projectId]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (disabled || saving) return;
    const key = name.trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(key)) {
      setError(
        "Use a name containing letters, numbers, and underscores, such as WEATHER_API_KEY.",
      );
      return;
    }
    if (!value.length) {
      setError("Enter a value before saving.");
      return;
    }
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await api<EnvironmentResponse>(
        `/api/v2/projects/${encodeURIComponent(projectId)}/environment`,
        {
          method: "PUT",
          body: JSON.stringify({ set: { [key]: value }, remove: [] }),
        },
      );
      setValue("");
      setName("");
      setNotice(`${key} saved. Deploy the app to apply this change.`);
      setVariables(response.variables);
    } catch {
      // Do not reflect server error bodies: an upstream error must never echo a submitted secret.
      setError(
        "Could not save this variable. Check the name and connection, then try again. Reserved platform names cannot be changed.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!removeName || disabled || saving) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await api<EnvironmentResponse>(
        `/api/v2/projects/${encodeURIComponent(projectId)}/environment`,
        {
          method: "PUT",
          body: JSON.stringify({ set: {}, remove: [removeName] }),
        },
      );
      setNotice(`${removeName} removed. Deploy the app to apply this change.`);
      if (name === removeName) {
        setName("");
        setValue("");
      }
      setRemoveName(null);
      setVariables(response.variables);
    } catch {
      setError("Could not remove this variable. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="v2-environment">
      <div className="v2-environment-heading">
        <span className="v2-version-icon">
          <KeyRound size={18} />
        </span>
        <div>
          <h2>Environment variables</h2>
          <p>Connect your app to the services you choose.</p>
        </div>
      </div>
      <p className="v2-environment-help">
        Add API keys and configuration here, rather than in your conversation or
        source files. Saved values are not displayed. Changes apply on the next
        deployment.
      </p>
      {error && (
        <div className="v2-error" role="alert">
          <p>{error}</p>
          <Button
            variant="ghost"
            isDisabled={saving}
            onPress={() =>
              void refresh()
                .then(() => setError(""))
                .catch(() =>
                  setError("Settings are still unavailable. Please try again."),
                )
            }
          >
            Reload settings
          </Button>
        </div>
      )}
      {notice && (
        <p className="v2-environment-notice" role="status">
          <Check size={16} />
          {notice}
        </p>
      )}
      <form className="v2-environment-form" onSubmit={save} autoComplete="off">
        <label htmlFor="v2-env-name">Variable name</label>
        <Input
          id="v2-env-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="WEATHER_API_KEY"
          maxLength={128}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          disabled={disabled || saving || loading}
          required
        />
        <label htmlFor="v2-env-value">
          {replacing ? "Replacement value" : "Value"}
        </label>
        <Input
          id="v2-env-value"
          type="password"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={
            replacing ? "Enter the new value" : "Paste the value here"
          }
          autoComplete="new-password"
          spellCheck={false}
          maxLength={8192}
          disabled={disabled || saving || loading}
          required
        />
        <div>
          <small>
            {replacing
              ? "This replaces the saved value for this name."
              : "Values are stored on your studio server."}
          </small>
          <Button
            className="v2-primary"
            type="submit"
            isDisabled={disabled || saving || loading || !name.trim() || !value}
          >
            {saving ? (
              <LoaderCircle className="v2-spin" size={15} />
            ) : (
              <Plus size={15} />
            )}{" "}
            {replacing ? "Replace value" : "Save variable"}
          </Button>
        </div>
      </form>
      <div className="v2-environment-list-heading">
        <h3>Configured variables</h3>
        <span>{variables.length}</span>
      </div>
      {loading ? (
        <p className="v2-loading-inline">
          <LoaderCircle className="v2-spin" size={16} /> Loading settings…
        </p>
      ) : variables.length === 0 ? (
        <p className="v2-environment-empty">
          No variables added yet. Your app can use its built-in database without
          adding any.
        </p>
      ) : (
        <ul className="v2-environment-list">
          {variables.map((variable) => (
            <li key={variable.name}>
              <div>
                <code>{variable.name}</code>
                <span>
                  {variable.configured
                    ? "Configured · value hidden"
                    : "Not configured"}
                </span>
              </div>
              <Button
                variant="ghost"
                isIconOnly
                aria-label={`Replace ${variable.name}`}
                isDisabled={disabled || saving}
                onPress={() => {
                  setName(variable.name);
                  setValue("");
                  setNotice("");
                  document.getElementById("v2-env-value")?.focus();
                }}
              >
                <Pencil size={15} />
              </Button>
              <Button
                variant="ghost"
                isIconOnly
                aria-label={`Remove ${variable.name}`}
                isDisabled={disabled || saving}
                onPress={() => setRemoveName(variable.name)}
              >
                <Trash2 size={15} />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {removeName && (
        <div
          className="v2-environment-remove"
          role="group"
          aria-label={`Confirm removal of ${removeName}`}
        >
          <div>
            <strong>Remove {removeName}?</strong>
            <p>
              Its value cannot be recovered from this screen. The running app
              changes only after deployment.
            </p>
          </div>
          <div>
            <Button
              variant="ghost"
              isDisabled={saving}
              onPress={() => setRemoveName(null)}
            >
              <X size={14} /> Cancel
            </Button>
            <Button
              className="v2-primary"
              isDisabled={disabled || saving}
              onPress={() => void remove()}
            >
              Remove variable
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
