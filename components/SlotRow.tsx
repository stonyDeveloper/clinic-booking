"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { durationMinutes, formatTime } from "@/lib/time";
import Confirmation from "./Confirmation";
import type { Booking, Slot } from "./types";

export default function SlotRow({
  slot,
  open,
  booking,
  onOpen,
  onClose,
  onBooked,
}: {
  slot: Slot;
  open: boolean;
  booking: Booking | null;
  onOpen: () => void;
  onClose: () => void;
  onBooked: (booking: Booking) => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const idempotencyKey = useRef("");
  const reduce = useReducedMotion();

  // One key per booking attempt: if the request is retried, the server can tell
  // it is the same attempt and will not create a second booking.
  useEffect(() => {
    if (open) {
      if (!idempotencyKey.current) idempotencyKey.current = crypto.randomUUID();
    } else {
      idempotencyKey.current = "";
      setError(null);
    }
  }, [open]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;

    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/ui/book", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey.current,
        },
        body: JSON.stringify({ slot_id: slot.id, name, email }),
      });
      const data = (await res.json().catch(() => null)) as
        | Booking
        | { error?: string }
        | null;

      if (res.status === 201) {
        onBooked(data as Booking);
        setName("");
        setEmail("");
        idempotencyKey.current = "";
      } else if (res.status === 409) {
        setError("That slot was taken while you were typing. Choose another.");
      } else {
        setError(
          (data as { error?: string } | null)?.error ??
            "That didn’t go through. Try again.",
        );
      }
    } catch {
      setError("Network error — check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const confirmed = booking?.slot_id === slot.id ? booking : null;

  return (
    <div className="row-wrap" data-open={open}>
      <button
        type="button"
        className="row"
        onClick={open ? onClose : onOpen}
        disabled={!slot.available && !confirmed}
        aria-expanded={open}
        data-cursor
      >
        <span className="row-time">{formatTime(slot.start)}</span>
        <span className="row-provider">{slot.provider}</span>
        <span className="row-duration mono">
          {durationMinutes(slot.start, slot.end)} min
        </span>
        <span className="row-state mono">
          {confirmed ? "Yours" : slot.available ? "Open" : "Taken"}
        </span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="panel"
            className="panel-clip"
            initial={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
            animate={reduce ? { opacity: 1 } : { height: "auto", opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="panel">
              {confirmed ? (
                <Confirmation
                  booking={confirmed}
                  slot={slot}
                  onDone={onClose}
                />
              ) : (
                <form className="booking-form" onSubmit={submit}>
                  <div className="panel-head">
                    <span className="mono">Book this appointment</span>
                    <span className="mono panel-slot">
                      {formatTime(slot.start)} · {slot.provider}
                    </span>
                  </div>

                  <div className="fields">
                    <label className="field-group">
                      <span className="mono field-label">Name</span>
                      <input
                        className="field"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Ada Obi"
                        autoComplete="name"
                        required
                      />
                    </label>

                    <label className="field-group">
                      <span className="mono field-label">Email</span>
                      <input
                        className="field"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="ada@example.com"
                        autoComplete="email"
                        required
                      />
                    </label>
                  </div>

                  <div className="panel-foot">
                    <button className="btn btn-solid" type="submit" disabled={busy}>
                      {busy ? "Booking…" : "Confirm booking"}
                    </button>
                    <button
                      className="btn btn-quiet"
                      type="button"
                      onClick={onClose}
                    >
                      Cancel
                    </button>
                    <AnimatePresence>
                      {error && (
                        <motion.p
                          className="form-error mono"
                          initial={{ opacity: 0, y: -6 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0 }}
                        >
                          {error}
                        </motion.p>
                      )}
                    </AnimatePresence>
                  </div>
                </form>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
