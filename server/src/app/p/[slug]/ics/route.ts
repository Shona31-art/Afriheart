import { getBundleBySlug } from "@/lib/domain";
import { lockedOption } from "@/lib/plan-machine";

const stamp = (iso: string) => iso.replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const esc = (s: string) => s.replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\n/g, "\\n");

export async function GET(_req: Request, ctx: RouteContext<"/p/[slug]/ics">) {
  const { slug } = await ctx.params;
  const b = await getBundleBySlug(slug);
  const o = b && lockedOption(b);
  if (!b || !o) return new Response("This plan isn't locked yet.", { status: 404 });
  const end = new Date(Date.parse(o.starts_at) + 3 * 3600000).toISOString();
  const ics = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Afriheart//Plans//EN", "BEGIN:VEVENT",
    `UID:${b.plan.id}@common`, `DTSTAMP:${stamp(new Date().toISOString())}`,
    `DTSTART:${stamp(o.starts_at)}`, `DTEND:${stamp(end)}`,
    `SUMMARY:${esc(b.plan.title)}`, `LOCATION:${esc(`${o.what}, ${o.where_name}`)}`,
    `DESCRIPTION:${esc(`${o.note ?? ""}\nPlan: /p/${slug}`)}`,
    "BEGIN:VALARM", "TRIGGER:-PT2H", "ACTION:DISPLAY", `DESCRIPTION:${esc(b.plan.title)}`, "END:VALARM",
    "END:VEVENT", "END:VCALENDAR",
  ].join("\r\n");
  return new Response(ics, {
    headers: { "content-type": "text/calendar; charset=utf-8", "content-disposition": `attachment; filename="common-${slug}.ics"` },
  });
}
