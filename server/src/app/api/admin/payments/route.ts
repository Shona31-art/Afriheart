import { api } from "@/lib/api";
import { paymentsList } from "@/lib/admin";

export const GET = () => api((me) => paymentsList(me));
