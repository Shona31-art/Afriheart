// Sharing an image the phone made (album pages, quiz results) to TikTok,
// Instagram Stories, WhatsApp and so on. Browser only.

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

type Bridge = { shareFile?: (n: string, m: string, b: string, t: string) => boolean; saveFile?: (n: string, m: string, b: string) => boolean };

/** Opens the phone's share sheet with the image; saves it instead where sharing files isn't possible. */
export async function shareImage(blob: Blob, name: string, text: string): Promise<"shared" | "saved" | "cancelled"> {
  const bridge = (window as unknown as { CommonAndroid?: Bridge }).CommonAndroid;
  if (bridge?.shareFile) {
    if (bridge.shareFile(name, blob.type, await toBase64(blob), text)) return "shared";
  }
  const file = new File([blob], name, { type: blob.type });
  if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text });
      return "shared";
    } catch (e) {
      if ((e as Error).name === "AbortError") return "cancelled";
    }
  }
  const { saveFile } = await import("./album");
  await saveFile(blob, name);
  return "saved";
}

/** The site's address for links on shared images, e.g. "common.co.za". */
export function siteHost(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  try {
    return new URL(configured || window.location.origin).host;
  } catch {
    return window.location.host;
  }
}

/** Shares a link with the phone's share sheet (WhatsApp and so on), or copies it. */
export async function shareLink(d: { title: string; text: string; url: string }): Promise<"shared" | "copied" | "none"> {
  if (typeof navigator.share === "function") {
    try {
      await navigator.share(d);
      return "shared";
    } catch (e) {
      if ((e as Error).name === "AbortError") return "none";
    }
  }
  try {
    await navigator.clipboard.writeText(`${d.text} ${d.url}`);
    return "copied";
  } catch {
    return "none";
  }
}
