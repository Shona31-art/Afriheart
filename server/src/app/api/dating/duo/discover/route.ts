import { api } from "@/lib/api";
import { discoverDuos } from "@/lib/double";

/** Pairs my pair could double date with. */
export const GET = () => api((me) => discoverDuos(me));
