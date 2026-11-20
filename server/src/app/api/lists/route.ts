import { api, body } from "@/lib/api";
import { createList, myLists } from "@/lib/chat-lists";

export const GET = () => api((me) => myLists(me));

/** { name, chat_id? } */
export const POST = async (req: Request) => {
  const b = await body(req);
  return api((me) => createList(me, b.name, b.chat_id));
};
