import { api } from "@/lib/api";
import { inbox } from "@/lib/support";

export const GET = (req: Request) => api((me) => inbox(me, new URL(req.url).searchParams.get("filter") ?? "open"));
