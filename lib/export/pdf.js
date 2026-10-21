import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { randomBytes } from "node:crypto";

const WINDOWS_BROWSERS = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
];

const MAC_BROWSERS = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
];

const LINUX_BROWSERS = ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "microsoft-edge", "microsoft-edge-stable"];

async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

/** Locate a Chromium-family browser usable for headless print-to-PDF. */
export async function findBrowser(configured) {
  if (typeof configured === "string" && configured !== "" && await exists(configured)) return configured;
  if (process.env.PAPER_BROWSER && await exists(process.env.PAPER_BROWSER)) return process.env.PAPER_BROWSER;
  const candidates = process.platform === "win32"
    ? WINDOWS_BROWSERS
    : (process.platform === "darwin" ? MAC_BROWSERS : []);
  for (const candidate of candidates) {
    if (await exists(candidate)) return candidate;
  }
  if (process.platform !== "win32" && process.platform !== "darwin") {
    for (const name of LINUX_BROWSERS) {
      const found = await which(name);
      if (found) return found;
    }
  }
  return null;
}

function which(name) {
  return new Promise((resolve) => {
    const child = spawn(process.platform === "win32" ? "where" : "which", [name], { windowsHide: true });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk.toString(); });
    child.on("error", () => resolve(null));
    child.on("close", (code) => resolve(code === 0 ? output.split(/\r?\n/)[0].trim() : null));
  });
}

function run(command, args, timeoutMs) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      try { child.kill("SIGKILL"); } catch { /* already gone */ }
      if (process.platform === "win32" && child.pid) {
        const killer = spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
        killer.on("error", () => {});
      }
      settled = true;
      resolve({ code: null, timedOut: true, stdout, stderr: stderr + "\n[timed out after " + timeoutMs + " ms]" });
    }, timeoutMs);
    child.stdout.on("data", (chunk) => { stdout = (stdout + chunk.toString()).slice(-20000); });
    child.stderr.on("data", (chunk) => { stderr = (stderr + chunk.toString()).slice(-20000); });
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code: null, timedOut: false, stdout, stderr: stderr + "\n" + error.message });
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code, timedOut: false, stdout, stderr });
    });
  });
}

/**
 * Convert the already-rendered HTML to PDF with a headless Chromium browser.
 * A missing browser is a per-format failure, not an export-wide failure: HTML
 * and DOCX are still produced.
 */
export async function renderPdf({ htmlPath, pdfPath, config, warnings }) {
  const browser = await findBrowser(config.pdf.browserPath);
  if (!browser) {
    return {
      ok: false,
      error: "no Chromium browser found for PDF export; set export.pdf.browserPath, PAPER_BROWSER, or install Chrome/Edge",
    };
  }
  const userDataDir = path.join(os.tmpdir(), "dsh-paper-browser-" + process.pid + "-" + randomBytes(4).toString("hex"));
  await fs.mkdir(userDataDir, { recursive: true });
  await fs.rm(pdfPath, { force: true });
  const args = [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-extensions",
    "--disable-background-networking",
    "--disable-sync",
    "--metrics-recording-only",
    "--mute-audio",
    "--hide-scrollbars",
    "--run-all-compositor-stages-before-draw",
    "--virtual-time-budget=10000",
    "--no-pdf-header-footer",
    "--user-data-dir=" + userDataDir,
    "--print-to-pdf=" + pdfPath,
    pathToFileURL(htmlPath).href,
  ];
  let result;
  try {
    result = await run(browser, args, config.pdf.timeoutMs);
  } finally {
    await fs.rm(userDataDir, { recursive: true, force: true }).catch(() => {});
  }
  if (result.timedOut) {
    warnings.push("PDF export timed out after " + config.pdf.timeoutMs + " ms");
    return { ok: false, browser, error: "PDF export timed out", stderr: result.stderr };
  }
  let bytes = 0;
  try {
    const data = await fs.readFile(pdfPath);
    bytes = data.length;
    const signature = data.subarray(0, 5).toString("ascii");
    if (signature !== "%PDF-") {
      return { ok: false, browser, error: "browser did not produce a PDF (signature " + JSON.stringify(signature) + ")", stderr: result.stderr };
    }
  } catch (error) {
    return { ok: false, browser, error: "PDF file was not created: " + error.message + (result.code !== null ? " (exit " + result.code + ")" : ""), stderr: result.stderr };
  }
  if (result.code !== 0 && bytes === 0) {
    return { ok: false, browser, error: "browser exited with code " + result.code, stderr: result.stderr };
  }
  const noisy = result.stderr.trim().split(/\r?\n/).filter((line) => {
    const text = line.trim();
    return text !== "" && !/bytes written to file/i.test(text) && !/^\[(?:\d+:)?\d+[:.]/.test(text);
  });
  if (noisy.length > 0) {
    warnings.push("PDF browser stderr: " + noisy.slice(-3).join(" | "));
  }
  return { ok: true, browser, bytes };
}