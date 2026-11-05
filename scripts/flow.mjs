/**
 * Dev-only walkthrough: scrolls to the schedule, opens a slot, books it, and
 * captures each state. Uses the Edge/Chrome already installed.
 */
import puppeteer from "puppeteer-core";
import { mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";

const url = process.argv[2] ?? "http://127.0.0.1:3100/";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const candidates = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
];
const executablePath = candidates.find((p) => existsSync(p));
if (!executablePath) throw new Error("No browser found");

await mkdir("shots", { recursive: true });

const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars"],
});

const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
page.on("console", (m) => {
  if (m.type() === "error") console.log("console error:", m.text().slice(0, 200));
});
page.on("pageerror", (e) => console.log("page error:", String(e).slice(0, 200)));

await page.goto(url, { waitUntil: "networkidle0", timeout: 90_000 });
await page.addStyleTag({ content: ".cursor-dot{display:none !important}" });
await sleep(1200);

// 1. schedule
await page.evaluate(() => document.querySelector("#schedule")?.scrollIntoView({ block: "start" }));
await sleep(1600);
await page.screenshot({ path: "shots/1-schedule.png" });

// 2. hover state on a row
const rows = await page.$$(".row:not([disabled])");
console.log("open rows:", rows.length);
await rows[2].hover();
await sleep(700);
await page.screenshot({ path: "shots/2-hover.png" });

// 3. open a slot
await rows[0].click();
await sleep(1000);
await page.screenshot({ path: "shots/3-panel.png" });

// 4. fill and submit
const fields = await page.$$(".field");
await fields[0].type("Ada Obi");
await fields[1].type("ada@example.com");
await sleep(300);
await page.click('button[type="submit"]');
await sleep(2600);
await page.screenshot({ path: "shots/4-confirmed.png" });

const stamp = await page.$eval("body", (b) =>
  b.innerText.toUpperCase().includes("CONFIRMED") ? "confirmed" : "not confirmed",
);
console.log("state:", stamp);

// 5. your appointments
await page.evaluate(() => document.querySelector("#bookings")?.scrollIntoView({ block: "start" }));
await sleep(1200);
await page.type(".lookup .field", "ada@example.com");
await page.click('.lookup button[type="submit"]');
await sleep(1800);
await page.screenshot({ path: "shots/5-my-bookings.png" });

// 5b. cancel it
await page.click(".mine .link");
await sleep(1800);
await page.screenshot({ path: "shots/5b-cancelled.png" });
const cancelled = await page.$eval(".mine", (el) => el.innerText.toUpperCase().includes("CANCELLED"));
console.log("cancelled in ui:", cancelled);

// 6. mobile
const mobile = await browser.newPage();
await mobile.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
await mobile.goto(url, { waitUntil: "networkidle0", timeout: 90_000 });
await mobile.addStyleTag({ content: ".cursor-dot{display:none !important}" });
await sleep(1400);
await mobile.screenshot({ path: "shots/6-mobile-hero.png" });

await mobile.evaluate(() => document.querySelector("#schedule")?.scrollIntoView({ block: "start" }));
await sleep(1600);
await mobile.screenshot({ path: "shots/7-mobile-schedule.png" });

const mobileRows = await mobile.$$(".row:not([disabled])");
await mobileRows[0].tap();
await sleep(1000);
await mobile.screenshot({ path: "shots/8-mobile-panel.png" });

await browser.close();
console.log("done");
