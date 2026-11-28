// Makes ad pictures with Vercel AI Gateway. Run by .github/workflows/ad-images.yml.
// Reads prompts.json ([{ "name": "...", "prompt": "..." }]) and writes out/<name>.jpg.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import * as ai from "ai";

const generate = ai.generateImage ?? ai.experimental_generateImage;
const shots = JSON.parse(readFileSync(new URL("./prompts.json", import.meta.url)));
const only = (process.env.ONLY ?? "").split(",").map((s) => s.trim()).filter(Boolean);
mkdirSync("out", { recursive: true });
let failed = 0;
for (const shot of shots) {
  if (only.length && !only.includes(shot.name)) continue;
  for (const model of ["openai/gpt-image-2", "openai/gpt-image-1"]) {
    try {
      const { image } = await generate({ model, prompt: shot.prompt, size: "1024x1536", providerOptions: { openai: { quality: "high" } } });
      writeFileSync(`out/${shot.name}.png`, Buffer.from(image.uint8Array));
      console.log(`made ${shot.name} with ${model}`);
      break;
    } catch (e) {
      console.log(`${shot.name} with ${model} failed: ${e.message}`);
      if (model === "openai/gpt-image-1") failed++;
    }
  }
}
process.exit(failed ? 1 : 0);
