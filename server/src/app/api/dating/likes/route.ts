import { api } from "@/lib/api";
import { likesYou } from "@/lib/dating";

/** People who like you: how many for everyone, who with Afriheart+. */
export const GET = async () => api((me) => likesYou(me));
