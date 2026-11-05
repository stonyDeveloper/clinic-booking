"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Cursor from "./Cursor";
import MyBookings from "./MyBookings";
import Reveal from "./Reveal";
import SlotRow from "./SlotRow";
import SmoothScroll from "./SmoothScroll";
import { dayKey, formatDate, formatTime, formatWeekday } from "@/lib/time";
import type { Booking, Slot } from "./types";

export default function Experience({
  initialSlots,
  failed,
}: {
  initialSlots: Slot[];
  failed: boolean;
}) {
  const [slots, setSlots] = useState<Slot[]>(initialSlots);
  const [provider, setProvider] = useState("All");
  const [day, setDay] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [booking, setBooking] = useState<Booking | null>(null);

  const providers = useMemo(
    () => ["All", ...Array.from(new Set(slots.map((s) => s.provider)))],
    [slots],
  );

  const days = useMemo(() => {
    const first = new Map<string, string>();
    for (const slot of slots) {
      const key = dayKey(slot.start);
      if (!first.has(key)) first.set(key, slot.start);
    }
    return Array.from(first, ([key, iso]) => ({ key, iso })).sort((a, b) =>
      a.key.localeCompare(b.key),
    );
  }, [slots]);

  // Derived, not stored: the first day with something open is selected on the
  // very first render, so the server and the client agree on what is shown.
  const activeDay = useMemo(() => {
    if (day && days.some((d) => d.key === day)) return day;
    const firstOpen = slots.find((s) => s.available);
    return firstOpen ? dayKey(firstOpen.start) : (days[0]?.key ?? null);
  }, [day, days, slots]);

  const visible = useMemo(
    () =>
      slots.filter(
        (slot) =>
          (!activeDay || dayKey(slot.start) === activeDay) &&
          (provider === "All" || slot.provider === provider),
      ),
    [slots, activeDay, provider],
  );

  const next = useMemo(
    () =>
      slots
        .filter((s) => s.available)
        .sort((a, b) => a.start.localeCompare(b.start))[0] ?? null,
    [slots],
  );

  const openCount = useMemo(
    () => slots.filter((s) => s.available).length,
    [slots],
  );

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/ui/slots", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { slots?: Slot[] };
      if (Array.isArray(data.slots)) setSlots(data.slots);
    } catch {
      // The page still works from the data it already has.
    }
  }, []);

  const handleBooked = useCallback(
    (created: Booking) => {
      setBooking(created);
      setSlots((prev) =>
        prev.map((s) =>
          s.id === created.slot_id ? { ...s, available: false } : s,
        ),
      );
      void refresh();
    },
    [refresh],
  );

  return (
    <>
      <SmoothScroll />
      <Cursor />

      <header className="site-head">
        <a className="wordmark" href="/" data-cursor>
          Morrow
        </a>
        <span className="mono head-meta">General practice · Lagos</span>
        <a className="mono head-link" href="#schedule" data-cursor>
          Book
        </a>
      </header>

      <section className="hero">
        <h1 className="hero-title">
          <span className="line">
            <span style={{ animationDelay: "0ms" }}>Care,</span>
          </span>
          <span className="line">
            <span style={{ animationDelay: "110ms" }}>without the</span>
          </span>
          <span className="line">
            <span style={{ animationDelay: "220ms" }}>
              <em>waiting room.</em>
            </span>
          </span>
        </h1>

        <div className="hero-foot">
          <p className="lede">
            Thirty-minute appointments with a Morrow physician. Book online,
            arrive, be seen — no queue, no clipboard.
          </p>

          <div className="next">
            <span className="mono label">Next available</span>
            <span className="next-time">
              {next ? formatTime(next.start) : "—"}
            </span>
            <span className="mono next-meta">
              {next
                ? `${next.provider} · ${formatWeekday(next.start)} ${formatDate(next.start)}`
                : "No open slots"}
            </span>
          </div>
        </div>
      </section>

      <section className="schedule" id="schedule">
        <Reveal className="section-head">
          <h2 className="section-title">
            Available <em>appointments</em>
          </h2>
          <span className="mono count">{openCount} open</span>
        </Reveal>

        <Reveal delay={80}>
          <div className="filters">
            {providers.map((name) => (
              <button
                key={name}
                type="button"
                className="filter"
                data-active={provider === name}
                onClick={() => {
                  setProvider(name);
                  setOpenId(null);
                }}
                data-cursor
              >
                {name}
              </button>
            ))}
          </div>

          <div className="rail" role="tablist" aria-label="Day">
            {days.map((d) => (
              <button
                key={d.key}
                type="button"
                role="tab"
                aria-selected={activeDay === d.key}
                className="rail-day"
                data-active={activeDay === d.key}
                onClick={() => {
                  setDay(d.key);
                  setOpenId(null);
                }}
                data-cursor
              >
                <span className="mono">{formatWeekday(d.iso)}</span>
                <span className="rail-date">{formatDate(d.iso)}</span>
              </button>
            ))}
          </div>
        </Reveal>

        <div className="rows">
          {failed ? (
            <p className="empty mono">
              The booking service is not responding. Check the API key and
              database settings.
            </p>
          ) : visible.length === 0 ? (
            <p className="empty mono">
              Nothing open on this day for {provider}. Try another day.
            </p>
          ) : (
            visible.map((slot, index) => (
              <Reveal key={slot.id} delay={Math.min(index * 40, 240)}>
                <SlotRow
                  slot={slot}
                  open={openId === slot.id}
                  booking={booking}
                  onOpen={() => setOpenId(slot.id)}
                  onClose={() => setOpenId(null)}
                  onBooked={handleBooked}
                />
              </Reveal>
            ))
          )}
        </div>
      </section>

      <MyBookings slots={slots} onChanged={refresh} />

      <footer className="site-foot">
        <div className="foot-block">
          <span className="mono foot-label">Morrow</span>
          <p>14 Ozumba Mbadiwe Avenue, Victoria Island, Lagos</p>
          <p className="mono foot-note">Placeholder address</p>
        </div>
        <div className="foot-block">
          <span className="mono foot-label">Hours</span>
          <p>Monday to Friday, 09:00 – 17:00</p>
          <p className="mono foot-note">Placeholder hours</p>
        </div>
        <div className="foot-block">
          <span className="mono foot-label">Built for</span>
          <p>Koya Cohort 4 · Technical assessment</p>
          <p className="mono foot-note">
            Slots and bookings come from the live API
          </p>
        </div>
      </footer>
    </>
  );
}
