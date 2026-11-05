/**
 * Dev-only screenshot helper. Uses the Edge/Chrome already on the machine via
 * puppeteer-core (no browser download).
 *
 *   node scripts/shot.mjs [url] [outfile] [width] [height]
 */
import puppeteer from "puppeteer-core";
import { mkdir } from "node:fs/promises";

const url = process.argv[2] ?? "http://127.0.0.1:3100/";
const out = process.argv[3] ?? "shots/page.png";
const width = Number(process.argv[4] ?? 1440);
const height = Number(process.argv[5] ?? 900);

const candidates = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
];

const { existsSync } = await import("node:fs");
const executablePath = candidates.find((p) => existsSync(p));
if (!executablePath) throw new Error("No Edge or Chrome found");

await mkdir(out.replace(/[\\/][^\\/]+$/, ""), { recursive: true });

const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1"],
});

const page = await browser.newPage();
await page.setViewport({ width, height, deviceScaleFactor: 1 });
await page.goto(url, { waitUntil: "networkidle0", timeout: 90_000 });

// Let fonts settle and entry animations finish.
await new Promise((resolve) => setTimeout(resolve, 2600));

await page.screenshot({ path: out });
await page.screenshot({ path: out.replace(/\.png$/, "-full.png"), fullPage: true });

const errors = await page.$eval("body", () => document.body.innerText.slice(0, 400));
console.log("text:", errors.replace(/\s+/g, " ").slice(0, 220));
console.log("saved:", out);

await browser.close();
