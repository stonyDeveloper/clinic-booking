"use client";

import { useState } from "react";
import { formatLongDate, formatTime } from "@/lib/time";
import type { Booking, Slot } from "./types";

/**
 * "Your appointments" — look up by email, page through, cancel.
 *
 * Cancelling frees the slot, so the parent refreshes the schedule afterwards
 * and the row reappears as bookable without a reload.
 */
export default function MyBookings({
  slots,
  onChanged,
}: {
  slots: Slot[];
  onChanged: () => void;
}) {
  const [email, setEmail] = useState("");
  const [lookedUp, setLookedUp] = useState<string | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const slotFor = (id: string) => slots.find((slot) => slot.id === id) ?? null;

  async function load(address: string, nextCursor: string | null, append: boolean) {
    setBusy(true);
    setError(null);

    try {
      const query = new URLSearchParams({ email: address });
      if (nextCursor) query.set("cursor", nextCursor);

      const res = await fetch(`/api/ui/lookup?${query.toString()}`, {
        cache: "no-store",
      });
      const data = (await res.json().catch(() => null)) as
        | { bookings?: Booking[]; next_cursor?: string | null; error?: string }
        | null;

      if (!res.ok) {
        setError(data?.error ?? "Could not load those bookings.");
        return;
      }

      const rows = data?.bookings ?? [];
      setBookings((prev) => (append ? [...prev, ...rows] : rows));
      setCursor(data?.next_cursor ?? null);
      setLookedUp(address);
    } catch {
      setError("Network error — try again.");
    } finally {
      setBusy(false);
    }
  }

  async function cancel(id: string) {
    setCancelling(id);
    setError(null);

    try {
      const res = await fetch("/api/ui/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = (await res.json().catch(() => null)) as
        | Booking
        | { error?: string }
        | null;

      if (res.ok) {
        setBookings((prev) =>
          prev.map((b) => (b.id === id ? { ...b, status: "cancelled" } : b)),
        );
        onChanged();
      } else if (res.status === 409) {
        setBookings((prev) =>
          prev.map((b) => (b.id === id ? { ...b, status: "cancelled" } : b)),
        );
      } else {
        setError((data as { error?: string } | null)?.error ?? "Could not cancel.");
      }
    } catch {
      setError("Network error — try again.");
    } finally {
      setCancelling(null);
    }
  }

  return (
    <section className="mine" id="bookings">
      <div className="section-head">
        <h2 className="section-title">
          Your <em>appointments</em>
        </h2>
        <span className="mono count">
          {lookedUp ? `${bookings.length} shown` : "Look up by email"}
        </span>
      </div>

      <form
        className="lookup"
        onSubmit={(event) => {
          event.preventDefault();
          const address = email.trim();
          if (address) void load(address, null, false);
        }}
      >
        <label className="field-group lookup-field">
          <span className="mono field-label">Email</span>
          <input
            className="field"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            required
          />
        </label>

        <button className="btn btn-quiet" type="submit" disabled={busy}>
          {busy ? "Looking…" : "Find"}
        </button>
      </form>

      {error && <p className="form-error mono mine-error">{error}</p>}

      {lookedUp && bookings.length === 0 && !busy && (
        <p className="empty mono">No appointments under that address.</p>
      )}

      <div className="mine-list">
        {bookings.map((booking) => {
          const slot = slotFor(booking.slot_id);
          return (
            <div
              className="mine-row"
              key={booking.id}
              data-status={booking.status}
              data-cancelling={cancelling === booking.id}
            >
              <span className="mine-date">
                {slot ? formatLongDate(slot.start) : "Slot unavailable"}
              </span>
              <span className="mine-time mono">
                {slot ? `${formatTime(slot.start)} — ${formatTime(slot.end)}` : "—"}
              </span>
              <span className="mine-provider">{slot?.provider ?? "—"}</span>
              <span className="mine-status mono">{booking.status}</span>
              <span className="mine-ref mono">{booking.id.slice(0, 8)}</span>

              {booking.status === "confirmed" ? (
                <button
                  type="button"
                  className="link"
                  onClick={() => void cancel(booking.id)}
                  disabled={cancelling === booking.id}
                >
                  {cancelling === booking.id ? "Cancelling…" : "Cancel"}
                </button>
              ) : (
                <span className="mono mine-ref">—</span>
              )}
            </div>
          );
        })}
      </div>

      {cursor && (
        <button
          type="button"
          className="btn btn-quiet load-more"
          onClick={() => lookedUp && void load(lookedUp, cursor, true)}
          disabled={busy}
        >
          {busy ? "Loading…" : "Load more"}
        </button>
      )}
    </section>
  );
}
