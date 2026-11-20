import { api, body, s } from "@/lib/api";
import { myDevices, registerDevice } from "@/lib/devices";
import { linkSessionToDevice } from "@/lib/session";

export const GET = () => api(async (me) => (await myDevices(me)).map((d) => ({ id: d.id, label: d.label, created_at: d.created_at })));

/** A phone/browser registers its public keys: { enc_pub, sig_pub, label } → { id } */
export const POST = async (req: Request) => {
  const b = await body(req);
  return api(async (me) => {
    const d = await registerDevice(me, s(b.enc_pub), s(b.sig_pub), s(b.label));
    await linkSessionToDevice(d.id);
    return { id: d.id };
  });
};
