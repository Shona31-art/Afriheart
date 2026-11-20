import { api } from "@/lib/api";
import { searchPeople } from "@/lib/admin";

export const GET = (req: Request) => api((me) => searchPeople(me, new URL(req.url).searchParams.get("q") ?? ""));
