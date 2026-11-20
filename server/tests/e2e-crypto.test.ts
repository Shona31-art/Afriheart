import { describe, expect, it } from "vitest";
import {
  CannotDecrypt, decryptBlob, encryptBlob, generateDeviceKeys, openEnvelope, sealEnvelope, securityCode, signText, verifyText, type Payload,
} from "@/lib/e2e-crypto";

async function devices() {
  const [alice, bob, bobLaptop, eve] = await Promise.all([generateDeviceKeys(), generateDeviceKeys(), generateDeviceKeys(), generateDeviceKeys()]);
  return { alice, bob, bobLaptop, eve };
}

describe("end-to-end encryption", () => {
  it("every recipient device decrypts; the plaintext isn't in the envelope", async () => {
    const { alice, bob, bobLaptop } = await devices();
    const payload: Payload = { t: "text", text: "Braai at mine, 6pm 🔥" };
    const env = await sealEnvelope({
      chatId: "chat-1", payload, sender: { deviceId: "a1", sigPriv: alice.sigPriv },
      recipients: [{ deviceId: "a1", encPub: alice.encPub }, { deviceId: "b1", encPub: bob.encPub }, { deviceId: "b2", encPub: bobLaptop.encPub }],
    });
    expect(JSON.stringify(env)).not.toContain("Braai");
    for (const [id, k] of [["a1", alice], ["b1", bob], ["b2", bobLaptop]] as const) {
      expect(await openEnvelope(env, { deviceId: id, encPriv: k.encPriv }, alice.sigPub, "chat-1")).toEqual(payload);
    }
  });

  it("a device that wasn't a recipient can't read it", async () => {
    const { alice, bob, eve } = await devices();
    const env = await sealEnvelope({ chatId: "c", payload: { t: "text", text: "secret" }, sender: { deviceId: "a1", sigPriv: alice.sigPriv }, recipients: [{ deviceId: "b1", encPub: bob.encPub }] });
    await expect(openEnvelope(env, { deviceId: "e1", encPriv: eve.encPriv }, alice.sigPub, "c")).rejects.toThrow(CannotDecrypt);
    // Even pretending to be b1, the wrong private key fails.
    await expect(openEnvelope(env, { deviceId: "b1", encPriv: eve.encPriv }, alice.sigPub, "c")).rejects.toThrow("damaged");
  });

  it("the server can't alter, re-route or forge messages", async () => {
    const { alice, bob, eve } = await devices();
    const env = await sealEnvelope({ chatId: "c", payload: { t: "text", text: "hi" }, sender: { deviceId: "a1", sigPriv: alice.sigPriv }, recipients: [{ deviceId: "b1", encPub: bob.encPub }] });
    const me = { deviceId: "b1", encPriv: bob.encPriv };
    const flipped = { ...env, ct: env.ct.slice(0, -4) + (env.ct.endsWith("AAA=") ? "BBB=" : "AAA=") };
    await expect(openEnvelope(flipped, me, alice.sigPub, "c")).rejects.toThrow("bad-signature");
    await expect(openEnvelope(env, me, alice.sigPub, "another-chat")).rejects.toThrow("damaged");
    await expect(openEnvelope(env, me, eve.sigPub, "c")).rejects.toThrow("bad-signature"); // claimed to be from someone else
    const forged = await sealEnvelope({ chatId: "c", payload: { t: "text", text: "fake" }, sender: { deviceId: "a1", sigPriv: eve.sigPriv }, recipients: [{ deviceId: "b1", encPub: bob.encPub }] });
    await expect(openEnvelope(forged, me, alice.sigPub, "c")).rejects.toThrow("bad-signature");
  });

  it("encrypts photos and voice notes separately", async () => {
    const data = new TextEncoder().encode("pretend this is a JPEG").buffer as ArrayBuffer;
    const sealed = await encryptBlob(data);
    expect(new TextDecoder().decode(sealed.data)).not.toContain("JPEG");
    expect(new TextDecoder().decode(await decryptBlob(sealed.data, sealed.key, sealed.iv))).toBe("pretend this is a JPEG");
  });

  it("signs call set-up and gives both sides the same security code", async () => {
    const { alice, bob } = await devices();
    const sig = await signText(alice.sigPriv, "offer-sdp");
    expect(await verifyText(alice.sigPub, "offer-sdp", sig)).toBe(true);
    expect(await verifyText(alice.sigPub, "tampered-sdp", sig)).toBe(false);
    expect(await verifyText(bob.sigPub, "offer-sdp", sig)).toBe(false);
    const a = await securityCode([{ person_id: "p1", sig_pub: alice.sigPub }, { person_id: "p2", sig_pub: bob.sigPub }]);
    const b = await securityCode([{ person_id: "p2", sig_pub: bob.sigPub }, { person_id: "p1", sig_pub: alice.sigPub }]);
    expect(a).toBe(b);
    expect(a).toMatch(/^(\d{5} ){11}\d{5}$/);
  });
});
