"use client";
import { useEffect, useState, type FormEvent } from "react";
import { Button, Input } from "@heroui/react";
import { ArrowRight, LoaderCircle, Mail } from "lucide-react";
import { api } from "./api";

export function EmailSignIn({ onAuthenticated }: { onAuthenticated(): void }) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    const timer = setInterval(
      () => setCooldown((value) => Math.max(0, value - 1)),
      1000,
    );
    return () => clearInterval(timer);
  }, []);
  async function requestCode() {
    if (busy || cooldown > 0) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await api<{ sent: boolean; expiresInSeconds: number }>(
        "/api/v2/auth/otp/request",
        { method: "POST", body: JSON.stringify({ email: email.trim() }) },
      );
      if (!result.sent)
        throw new Error("The server could not confirm sending a sign-in code.");
      setSent(true);
      setCode("");
      setCooldown(60);
      setNotice(
        `Code sent. Check your inbox. It expires in ${Math.ceil(result.expiresInSeconds / 60)} minutes.`,
      );
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Could not send a sign-in code.",
      );
      // Failed mail attempts may also be rate limited on the server.
      setCooldown(60);
    } finally {
      setBusy(false);
    }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!sent) {
      await requestCode();
      return;
    }
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await api("/api/v2/auth/otp/verify", {
        method: "POST",
        body: JSON.stringify({ email: email.trim(), code }),
      });
      setCode("");
      onAuthenticated();
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Could not verify the code.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit}>
      <p className="v2-email-help">
        Email sign-in is available for invited addresses when the studio’s email
        service is configured. Your password account remains available.
      </p>
      <label htmlFor="v2-email">Email address</label>
      <Input
        id="v2-email"
        type="email"
        autoComplete="email"
        inputMode="email"
        autoCapitalize="none"
        maxLength={254}
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        required
        disabled={busy || sent}
      />
      {sent && (
        <>
          <Button
            variant="ghost"
            isDisabled={busy}
            onPress={() => {
              setSent(false);
              setCode("");
              setNotice("");
              setError("");
            }}
          >
            Use another email
          </Button>
          <label htmlFor="v2-email-code">Six-digit code</label>
          <Input
            id="v2-email-code"
            autoComplete="one-time-code"
            inputMode="numeric"
            pattern="[0-9]{6}"
            minLength={6}
            maxLength={6}
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
            required
            disabled={busy}
          />
        </>
      )}
      {notice && <p role="status">{notice}</p>}
      {error && (
        <p role="alert" className="v2-error">
          {error}
        </p>
      )}
      <Button
        type="submit"
        className="v2-primary"
        isDisabled={busy || (!sent && cooldown > 0)}
      >
        {busy ? (
          <LoaderCircle className="v2-spin" size={18} />
        ) : sent ? (
          <ArrowRight size={18} />
        ) : (
          <Mail size={18} />
        )}
        {busy
          ? "Please wait…"
          : sent
            ? "Verify and sign in"
            : cooldown > 0
              ? `Try again in ${cooldown}s`
              : "Send sign-in code"}
      </Button>
      {sent && (
        <Button
          variant="ghost"
          isDisabled={busy || cooldown > 0}
          onPress={() => void requestCode()}
        >
          {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
        </Button>
      )}
    </form>
  );
}
