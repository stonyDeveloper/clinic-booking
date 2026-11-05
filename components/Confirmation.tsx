"use client";

import { motion, useReducedMotion } from "motion/react";
import { formatLongDate, formatTime } from "@/lib/time";
import type { Booking, Slot } from "./types";

function icsDate(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/**
 * The confirmation replaces the form inside the same expanded surface — the
 * row morphs rather than opening a second modal, so the booking feels like one
 * continuous object.
 */
export default function Confirmation({
  booking,
  slot,
  onDone,
}: {
  booking: Booking;
  slot: Slot;
  onDone: () => void;
}) {
  const reduce = useReducedMotion();

  function downloadCalendar() {
    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Morrow//Booking//EN",
      "CALSCALE:GREGORIAN",
      "BEGIN:VEVENT",
      `UID:${booking.id}`,
      `DTSTAMP:${icsDate(new Date().toISOString())}`,
      `DTSTART:${icsDate(slot.start)}`,
      `DTEND:${icsDate(slot.end)}`,
      `SUMMARY:Appointment with ${slot.provider} — Morrow`,
      `DESCRIPTION:Reference ${booking.id}`,
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");

    const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `morrow-${booking.id.slice(0, 8)}.ics`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="confirm">
      <div className="confirm-main">
        <motion.span
          className="stamp"
          initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 1.5, rotate: -18 }}
          animate={{ opacity: 1, scale: 1, rotate: -6 }}
          transition={
            reduce
              ? { duration: 0.2 }
              : { type: "spring", stiffness: 220, damping: 15 }
          }
        >
          Confirmed
        </motion.span>

        <h3 className="confirm-date">{formatLongDate(slot.start)}</h3>
        <p className="confirm-meta mono">
          {formatTime(slot.start)} — {formatTime(slot.end)} · {slot.provider}
        </p>

        <p className="confirm-ref mono">
          Reference {booking.id.slice(0, 8).toUpperCase()}
        </p>
        <p className="confirm-note">
          Keep the reference — it is how we find your appointment at the desk.
        </p>
      </div>

      <div className="confirm-side">
        <button type="button" className="btn" onClick={downloadCalendar}>
          Add to calendar
        </button>
        <button type="button" className="btn btn-quiet" onClick={onDone}>
          Book another
        </button>
      </div>
    </div>
  );
}
