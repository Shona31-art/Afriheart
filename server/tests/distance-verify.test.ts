import { beforeAll, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { cleanPoint, distanceLabel, km } from "@/lib/geo";
import { compatible, rank } from "@/lib/matching";
import type { DatingProfile } from "@/lib/types";

const dir = mkdtempSync(path.join(tmpdir(), "verify-"));
process.env.LOCAL_DB_PATH = path.join(dir, "db.json");
process.env.LOCAL_MEDIA_DIR = path.join(dir, "media");
process.env.TEAM_PHONES = "27825559999";

const NOW = new Date("2026-11-18T10:00:00Z");
const DURBAN = { lat: -29.86, lng: 31.03 };
const UMHLANGA = { lat: -29.73, lng: 31.08 }; // ~15 km
const PMB = { lat: -29.6, lng: 30.38 }; // ~70 km
const p = (over: Partial<DatingProfile>): DatingProfile => ({
  id: "x", person_id: "x", display_name: "X", birthdate: "1998-05-01", gender: "woman", interested_in: ["men"], age_min: 18, age_max: 99,
  area: "", bio: "", photos: ["profiles/aaaaaaaaaaaaaaaaaaaaaaaa.jpg"], date_idea: "Walk", date_idea_category: null,
  paused: false, consent_at: "", created_at: "", updated_at: "2026-11-01T00:00:00Z", ...over,
});
const her = (o: Partial<DatingProfile> = {}) => p({ person_id: "her", gender: "woman", interested_in: ["men"], ...DURBAN, max_km: 25, ...o });
const him = (o: Partial<DatingProfile> = {}) => p({ person_id: "him", gender: "man", interested_in: ["women"], ...UMHLANGA, max_km: 50, ...o });

describe("distance", () => {
  it("rounds locations to about 1 km and rejects nonsense", () => {
    expect(cleanPoint(-29.858734, 31.029212)).toEqual({ lat: -29.86, lng: 31.03 });
    expect(cleanPoint(0, 0)).toBeNull();
    expect(cleanPoint(120, 31)).toBeNull();
    expect(cleanPoint("abc", 1)).toBeNull();
    expect(cleanPoint(null, null)).toBeNull();
  });

  it("only ever shows a rough band", () => {
    expect(distanceLabel(0.4)).toBe("Less than 2 km away");
    expect(distanceLabel(3.2)).toBe("Less than 5 km away");
    expect(distanceLabel(14.9)).toBe("Less than 15 km away");
    expect(distanceLabel(15.4)).toBe("Less than 25 km away");
    expect(distanceLabel(800)).toBe("More than 500 km away");
    expect(distanceLabel(null)).toBeNull();
    expect(km(DURBAN, UMHLANGA)).toBeGreaterThan(10);
    expect(km(DURBAN, UMHLANGA)).toBeLessThan(20);
  });

  it("needs both people within each other's distance", () => {
    expect(compatible(her(), him(), NOW)).toBe(true);
    expect(compatible(her({ max_km: 10 }), him(), NOW)).toBe(false); // too far for her
    expect(compatible(him(), her({ max_km: 10 }), NOW)).toBe(false); // so he doesn't see her either
    expect(compatible(her({ max_km: 0 }), him({ ...PMB, max_km: 100 }), NOW)).toBe(true); // anywhere
    expect(compatible(her(), him({ lat: null, lng: null }), NOW)).toBe(true); // no location: not filtered out
  });

  it("ranks closer people a little higher", () => {
    const near = him({ person_id: "near", ...UMHLANGA });
    const far = him({ person_id: "far", ...PMB, max_km: 100 });
    expect(rank(her({ max_km: 100 }), near, false, 80)).toBeGreaterThan(rank(her({ max_km: 100 }), far, false, 80));
  });
});

describe("verified people only", () => {
  it("works both ways, and only once you're verified yourself", () => {
    const v = "2026-11-10T00:00:00Z";
    expect(compatible(her({ verified_at: v, verified_only: true }), him(), NOW)).toBe(false);
    expect(compatible(him(), her({ verified_at: v, verified_only: true }), NOW)).toBe(false);
    expect(compatible(her({ verified_at: v, verified_only: true }), him({ verified_at: v }), NOW)).toBe(true);
    expect(compatible(her({ verified_only: true }), him(), NOW)).toBe(true); // not verified: the setting does nothing
  });

  it("never shows people the team removed", () => {
    expect(compatible(her(), him({ removed_at: "2026-11-11T00:00:00Z" }), NOW)).toBe(false);
  });
});

describe("selfie verification and the team", async () => {
  const { findOrCreatePerson } = await import("@/lib/domain");
  const { getStore } = await import("@/lib/store");
  const team = await import("@/lib/team");
  const dating = await import("@/lib/dating");
  let ayesha: string, sipho: string, staff: string;
  const selfie = new Uint8Array(20000).fill(7);

  beforeAll(async () => {
    ayesha = (await findOrCreatePerson({ name: "Ayesha", phone: "27825550101", isGuest: false })).id;
    sipho = (await findOrCreatePerson({ name: "Sipho", phone: "27835550102", isGuest: false })).id;
    staff = (await findOrCreatePerson({ name: "Team Thandi", phone: "0825559999", isGuest: false })).id;
    const now = new Date().toISOString();
    for (const id of [ayesha, sipho]) {
      await getStore().insert("dating_profiles", { ...p({}), id, person_id: id, consent_at: now, created_at: now, updated_at: now });
    }
  });

  it("gives a pose from the server, then takes the live selfie", async () => {
    await expect(team.submitSelfie(ayesha, selfie, true)).rejects.toThrow(/Start again/);
    const s = await team.startVerification(ayesha);
    expect(s.state).toBe("started");
    expect(team.GESTURES).toContain(s.gesture);
    await expect(team.submitSelfie(ayesha, selfie, false)).rejects.toThrow(/agree/);
    expect((await team.submitSelfie(ayesha, selfie, true)).state).toBe("pending");
    await expect(team.startVerification(ayesha)).rejects.toThrow(/already with the team/);
  });

  it("is only for the team", async () => {
    expect(await team.isTeam(staff)).toBe(true);
    expect(await team.isTeam(sipho)).toBe(false);
    await expect(team.verificationQueue(sipho)).rejects.toThrow(/only for the Afriheart team/);
    const [item] = await team.verificationQueue(staff);
    expect(await team.canSeeSelfie(sipho, item.selfie)).toBe(false);
    expect(await team.canSeeSelfie(staff, item.selfie)).toBe(true);
  });

  it("deletes the selfie as soon as it's checked, and adds the badge", async () => {
    const [item] = await team.verificationQueue(staff);
    const file = path.join(dir, "media", item.selfie);
    expect(existsSync(file)).toBe(true);
    await team.reviewVerification(staff, item.id, "approve", "");
    expect(existsSync(file)).toBe(false);
    const row = await getStore().get("verifications", item.id);
    expect(row?.selfie_path).toBeNull();
    expect((await dating.getProfile(ayesha))?.verified_at).toBeTruthy();
    expect((await team.verifyStatus(ayesha)).state).toBe("approved");
  });

  it("tells people why a selfie was rejected, and lets them try again", async () => {
    await team.startVerification(sipho);
    await team.submitSelfie(sipho, selfie, true);
    const [item] = await team.verificationQueue(staff);
    await expect(team.reviewVerification(staff, item.id, "reject", "")).rejects.toThrow(/reason/);
    await team.reviewVerification(staff, item.id, "reject", "pose");
    const s = await team.verifyStatus(sipho);
    expect(s.state).toBe("rejected");
    expect(s.reason).toMatch(/pose/);
    expect((await team.startVerification(sipho)).state).toBe("started");
  });

  it("can remove someone from dating after a report, closing their other reports", async () => {
    await dating.report(ayesha, sipho, "harassment", "Rude messages");
    const urgent = await findOrCreatePerson({ name: "Lebo", phone: "27845550103", isGuest: false });
    await dating.report(urgent.id, sipho, "underage", "");
    const queue = await team.reportQueue(staff);
    expect(queue[0].reason).toBe("underage"); // urgent first
    expect(queue[0].reported?.reports).toBe(2);
    await team.reviewReport(staff, queue[0].id, "remove");
    expect(await team.reportQueue(staff)).toEqual([]);
    expect((await dating.getProfile(sipho))?.removed_at).toBeTruthy();
    await expect(dating.discover(sipho)).rejects.toThrow(/removed after a safety review/);
  });
});
