import { api } from "@/lib/api";
import { starredMessages } from "@/lib/chat-extras";

export const GET = () => api((me) => starredMessages(me));
