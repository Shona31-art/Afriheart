import { api, body, s } from "@/lib/api";
import { createGroup, listChats, openDirectChat } from "@/lib/chat";

export const GET = () => api((me) => listChats(me));

/** { kind: "direct", phone, name? } or { kind: "group", name, phones: [] } */
export const POST = async (req: Request) => {
  const b = await body(req);
  return api(async (me) => {
    const chat = s(b.kind) === "group"
      ? await createGroup(me, s(b.name), Array.isArray(b.phones) ? b.phones.map(String) : [])
      : await openDirectChat(me, s(b.phone), s(b.name) || undefined);
    return { id: chat.id };
  });
};
