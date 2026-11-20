import { publicApi } from "@/lib/api";
import { activeAnnouncement } from "@/lib/admin";

/** The banner everyone sees (maintenance, known problems), if there is one. */
export const GET = () => publicApi(async () => ({ announcement: await activeAnnouncement() }));
