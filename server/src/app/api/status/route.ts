import { api, body } from "@/lib/api";
import { postStatus, statusFeed } from "@/lib/status";

export const GET = () => api((me) => statusFeed(me));

/** { envelope, media? }: a new status, end-to-end encrypted for my contacts' devices. */
export const POST = async (req: Request) => {
  const b = await body(req);
  return api(async (me) => ({ id: (await postStatus(me, b.envelope, b.media)).id }));
};
