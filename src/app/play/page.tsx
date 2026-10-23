"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import QRCode from "qrcode";
import { browser, call } from "@/lib/studio/browser";
import "../studio.css";
type Room = {
  id: string;
  board: string[];
  turn: string;
  winner: string | null;
  host: string;
  guest: string | null;
  revision: number;
};
export default function Play() {
  const [room, setRoom] = useState<Room | null>(null),
    [invite, setInvite] = useState(""),
    [qr, setQr] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const epoch = useRef(0);
  function receive(next: Room) {
    setRoom((old) =>
      !old || old.id !== next.id || next.revision >= old.revision ? next : old,
    );
  }
  async function action(operation: string, cell?: number) {
    const started = epoch.current;
    setBusy(true);
    setMessage("");
    try {
      const r = await call("rooms", {
        operation,
        roomId: room?.id || invite,
        cell,
      });
      if (started === epoch.current) receive(r.room);
    } catch (e) {
      if (started === epoch.current) { setRoom(null); setQr(""); setMessage((e as Error).message); }
    } finally {
      if (started === epoch.current) setBusy(false);
    }
  }
  useEffect(() => {
    let disposed = false;
    const epochRef = epoch;
    void Promise.resolve().then(() => {
      if (!disposed) setInvite(new URLSearchParams(window.location.search).get("room") || "");
    });
    const subscription = browser()?.auth.onAuthStateChange(() => {
      epochRef.current++;
      setRoom(null); setInvite(""); setQr(""); setBusy(false);
      setMessage("Account changed. Ask your grown-up before joining a game.");
    });
    return () => { disposed = true; epochRef.current++; subscription?.data.subscription.unsubscribe(); };
  }, []);
  const roomId = room?.id;
  useEffect(() => {
    if (!roomId) return;
    const db = browser();
    if (!db) return;
    let disposed = false;
    let stopped = false;
    let refreshing = false;
    let pending: AbortController | undefined;
    let refreshDeadline: ReturnType<typeof setTimeout> | undefined;
    const started = epoch.current;
    const current = () => !disposed && !stopped && started === epoch.current;
    const link = `${window.location.origin}/play?room=${roomId}`;
    void QRCode.toDataURL(link, { width: 180, margin: 2 })
      .then(value => { if (current()) setQr(value); })
      .catch(() => { if (current()) setMessage("Could not create QR code. Use the invite link."); });
    const refresh = async () => {
      if (!current() || refreshing) return;
      refreshing = true;
      const controller = pending = new AbortController();
      const unavailable = () => {
        if (!current()) return;
        stopped = true;
        controller.abort();
        setRoom(null);
        setQr("");
        setMessage("Room paused, unavailable or expired. Both families need an active supervised session. Ask your grown-up before rejoining.");
      };
      // The timer clears the UI even if a faulty transport ignores cancellation.
      refreshDeadline = setTimeout(unavailable, 10000);
      try {
        const r = await db.from("studio_rooms").select("*").eq("id", roomId)
          .abortSignal(controller.signal).single();
        if (!current()) return;
        if (r.data && !r.error) receive(r.data as Room);
        else unavailable();
      } catch {
        unavailable();
      } finally {
        clearTimeout(refreshDeadline);
        refreshing = false;
        if (pending === controller) pending = undefined;
      }
    };
    const channel = db
      .channel(`room-${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "studio_rooms",
          filter: `id=eq.${roomId}`,
        },
        (p) => { if (current()) receive(p.new as Room); },
      )
      .subscribe((status) => {
        if (!current()) return;
        if (status === "SUBSCRIBED") void refresh();
        if (status === "CHANNEL_ERROR")
          setMessage(
            "Realtime connection unavailable; reconnecting with periodic refresh.",
          );
      });
    const timer = setInterval(() => void refresh(), 5000);
    return () => {
      disposed = true;
      clearInterval(timer);
      clearTimeout(refreshDeadline);
      pending?.abort();
      void db.removeChannel(channel).catch(() => {});
    };
  }, [roomId]);
  return (
    <div className="studio">
      <main className="studio-main">
        <Link href="/">← Back to studio</Link>
        <section className="panel" style={{ marginTop: 30 }}>
          <h1 style={{ fontSize: 32, fontWeight: 700 }}>Tic-tac-together</h1>
          <p>
            A realtime game for two approved builders. Share the private invite
            with someone you know. Both players need an active supervised
            session. Rooms expire after one hour.
          </p>
          <p role="status">{message}</p>
          {!room ? (
            <>
              <button disabled={busy} onClick={() => action("create")}>
                Create a room
              </button>
              <label>
                Room invite code
                <input
                  value={invite}
                  onChange={(e) => setInvite(e.target.value)}
                />
              </label>
              <button disabled={busy || !invite} onClick={() => action("join")}>
                Join a friend
              </button>
            </>
          ) : (
            <>
              <p>
                {room.winner
                  ? room.winner === "draw"
                    ? "A friendly draw!"
                    : `${room.winner} wins!`
                  : !room.guest
                    ? "Waiting for your friend…"
                    : `${room.turn} to play`}
              </p>
              <div className="game-board">
                {room.board.map((v, i) => (
                  <button
                    aria-label={`Row ${Math.floor(i / 3) + 1}, column ${(i % 3) + 1}: ${v || "empty"}`}
                    key={i}
                    disabled={busy || !!v || !!room.winner || !room.guest}
                    onClick={() => action("move", i)}
                  >
                    {v}
                  </button>
                ))}
              </div>
              {qr && (
                <Image
                  unoptimized
                  width={180}
                  height={180}
                  className="qr"
                  src={qr}
                  alt="Scan to join this game"
                />
              )}
              <label>
                Shareable invite
                <input
                  readOnly
                  value={`${typeof window === "undefined" ? "" : window.location.origin}/play?room=${roomId}`}
                />
              </label>
              <button
                onClick={() =>
                  navigator.clipboard
                    .writeText(`${window.location.origin}/play?room=${roomId}`)
                    .then(() => setMessage("Invite copied."))
                    .catch(() =>
                      setMessage("Copy the invite from the box above."),
                    )
                }
              >
                Copy invite
              </button>
            </>
          )}
        </section>
      </main>
    </div>
  );
}
