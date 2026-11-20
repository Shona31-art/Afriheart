import { api } from "@/lib/api";
import { gifProvider, searchGifs } from "@/lib/gifs";

/** ?q=… searches GIFs (empty: trending). ?config=1 says whether GIFs are switched on. */
export const GET = (req: Request) => {
  const url = new URL(req.url);
  return api(async () => {
    if (url.searchParams.get("config")) return { enabled: !!gifProvider() };
    return searchGifs(url.searchParams.get("q") ?? "");
  });
};
