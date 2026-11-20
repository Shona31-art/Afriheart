import { api, body, s } from "@/lib/api";
import { deleteProfile, getProfile, saveProfile } from "@/lib/dating";

export const GET = () => api(async (me) => (await getProfile(me)) ?? { none: true });

export const POST = async (req: Request) => {
  const b = await body(req);
  return api(async (me) => {
    const saved = await saveProfile(me, {
      display_name: s(b.display_name), birthdate: s(b.birthdate), gender: s(b.gender),
      interested_in: Array.isArray(b.interested_in) ? b.interested_in.map(String) : [],
      age_min: Number(b.age_min), age_max: Number(b.age_max), area: s(b.area), bio: s(b.bio),
      photos: Array.isArray(b.photos) ? b.photos.map(String) : [], date_idea: s(b.date_idea),
      paused: b.paused === true, consent: b.consent === true,
      ...("lat" in b ? { lat: b.lat, lng: b.lng } : {}), max_km: b.max_km, verified_only: b.verified_only === true,
      ...("prompts" in b ? { prompts: b.prompts } : {}), ...("voice" in b ? { voice: b.voice } : {}),
    });
    return { id: saved.id };
  });
};

/** Delete my dating profile (and all my likes). */
export const DELETE = () => api((me) => deleteProfile(me));
