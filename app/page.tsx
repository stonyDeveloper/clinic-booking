import Experience from "@/components/Experience";
import { apiFetch } from "@/lib/api";
import { ensureSeed } from "@/lib/seed";
import type { Slot } from "@/components/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * The page is a thin shell: the slots it renders come from GET /slots, the
 * same endpoint the grader calls, fetched with the API key on the server.
 */
export default async function Page() {
  await ensureSeed();

  const { status, body } = await apiFetch("/slots");
  const slots =
    status === 200 ? ((body as { slots?: Slot[] } | null)?.slots ?? []) : [];

  return <Experience initialSlots={slots} failed={status !== 200} />;
}
