"use client";
import { useState, type FormEvent } from "react";
import { Button, Input } from "@heroui/react";
import { ArrowRight, Boxes, LoaderCircle, LockKeyhole } from "lucide-react";
import { api, type StudioSession } from "./api";
import { EmailSignIn } from "./EmailSignIn";
export function StudioAuth({
  setupRequired,
  onAuthenticated,
}: {
  setupRequired: boolean;
  onAuthenticated(): void;
}) {
  const [emailMode, setEmailMode] = useState(false);
  const [setupUnavailable, setSetupUnavailable] = useState(false);
  const creatingAccount = setupRequired && !setupUnavailable;
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(`/api/v2/auth/${creatingAccount ? "setup" : "login"}`, {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });
      onAuthenticated();
    } catch (error) {
      if (creatingAccount) {
        try {
          const session = await api<StudioSession>("/api/v2/auth/session");
          if (session.user) {
            onAuthenticated();
            return;
          }
          if (!session.setupRequired) {
            setSetupUnavailable(true);
            setPassword("");
            setError(
              "This studio already has an account. Sign in with that account below.",
            );
            return;
          }
        } catch {
          /* Keep the original setup error if refreshing is unavailable. */
        }
      }
      setError(error instanceof Error ? error.message : "Could not sign in.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="v2-auth">
      <div className="v2-auth-brand">
        <span className="v2-brand-mark">
          <Boxes size={24} />
        </span>{" "}
        VibeKidding
      </div>
      <section className="v2-auth-card">
        <span className="v2-eyebrow">YOUR IDEAS, BUILT TOGETHER</span>
        <h1>
          {creatingAccount ? "Your own little launchpad." : "Welcome back."}
        </h1>
        <p>
          {creatingAccount
            ? "Create your studio account. Use the same account on your computer and phone."
            : "Sign in to your studio and pick up where you left off."}
        </p>
        <div
          className="v2-auth-methods"
          role="group"
          aria-label="Sign-in method"
        >
          <Button
            variant="ghost"
            aria-pressed={!emailMode}
            isDisabled={busy}
            onPress={() => setEmailMode(false)}
          >
            Username and password
          </Button>
          <Button
            variant="ghost"
            aria-pressed={emailMode}
            isDisabled={busy}
            onPress={() => setEmailMode(true)}
          >
            Email code
          </Button>
        </div>
        {emailMode ? (
          <EmailSignIn onAuthenticated={onAuthenticated} />
        ) : (
          <form onSubmit={submit}>
            <label htmlFor="v2-username">Username</label>
            <Input
              id="v2-username"
              name="username"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              minLength={3}
              maxLength={32}
              autoCapitalize="none"
              autoCorrect="off"
              disabled={busy}
            />
            <label htmlFor="v2-password">Password</label>
            <Input
              id="v2-password"
              name="password"
              type="password"
              autoComplete={
                creatingAccount ? "new-password" : "current-password"
              }
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={creatingAccount ? 8 : 1}
              disabled={busy}
            />
            {creatingAccount && <small>Use at least 8 characters.</small>}
            {error && (
              <p className="v2-error" role="alert">
                {error}
              </p>
            )}
            <Button type="submit" className="v2-primary" isDisabled={busy}>
              {busy ? (
                <LoaderCircle className="v2-spin" size={18} />
              ) : (
                <ArrowRight size={18} />
              )}{" "}
              {busy
                ? "Opening studio…"
                : creatingAccount
                  ? "Create account"
                  : "Sign in"}
            </Button>
          </form>
        )}
        <div className="v2-auth-note">
          <LockKeyhole size={15} /> Your projects are stored on this studio’s
          server.
        </div>
      </section>
    </main>
  );
}
