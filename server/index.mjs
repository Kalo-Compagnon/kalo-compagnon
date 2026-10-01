import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { resolve, extname, delimiter, sep } from "node:path";
import { createClient } from "@supabase/supabase-js";
const root = resolve("dist"),
  port = Number(process.env.PORT || 8787),
  production = process.env.NODE_ENV === "production";
const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  key =
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const auth =
  url && key
    ? createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null;
let running = 0;
function json(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(data));
}
const server = createServer(async (req, res) => {
  try {
    const path = new URL(req.url, "http://localhost").pathname;
    if (path === "/api/fit-monitoring") {
      if (req.method !== "POST")
        return json(res, 405, { error: "Méthode non autorisée" });
      if (production || auth) {
        if (!auth)
          return json(res, 503, {
            error: "Authentification du service FIT non configurée",
          });
        const token = (req.headers.authorization || "").replace(/^Bearer /, "");
        const { data, error } = await auth.auth.getUser(token);
        if (error || !data.user)
          return json(res, 401, {
            error: "Connecte-toi pour importer ce fichier FIT",
          });
      } else if (
        req.headers.origin &&
        !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.headers.origin)
      )
        return json(res, 403, { error: "Origine non autorisée en mode local" });
      if (running >= 2)
        return json(res, 429, {
          error: "Import déjà en cours, réessaie dans un instant",
        });
      const zone = String(req.headers["x-time-zone"] || "UTC");
      try {
        new Intl.DateTimeFormat("en", { timeZone: zone });
      } catch {
        return json(res, 400, { error: "Fuseau horaire invalide" });
      }
      if (Number(req.headers["content-length"]) > 20 * 1024 * 1024)
        return json(res, 413, { error: "Fichier FIT limité à 20 Mo" });
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 20 * 1024 * 1024)
          return json(res, 413, { error: "Fichier FIT limité à 20 Mo" });
        chunks.push(chunk);
      }
      running++;
      try {
        const output = await new Promise((resolveOutput, reject) => {
          const child = spawn(
            process.env.JAVA_BIN || "java",
            [
              "-Xmx128m",
              "-cp",
              ["server/classes", "server/lib/fit-21.214.0.jar"].join(delimiter),
              "MonitoringBridge",
              zone,
            ],
            { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] },
          );
          let output = "",
            errors = "";
          const timeout = setTimeout(() => {
            child.kill();
            reject(new Error("Délai de décodage dépassé"));
          }, 20000);
          child.stdout.on("data", (b) => {
            output += b;
            if (output.length > 5_000_000) {
              child.kill();
              reject(new Error("Résultat FIT trop volumineux"));
            }
          });
          child.stderr.on("data", (b) => {
            errors += b;
          });
          child.on("error", reject);
          child.on("close", (code) => {
            clearTimeout(timeout);
            if (code !== 0)
              reject(
                new Error(
                  "Décodage Garmin impossible : vérifie Java et le fichier FIT",
                ),
              );
            else {
              try {
                resolveOutput(JSON.parse(output));
              } catch {
                reject(new Error("Réponse Garmin invalide"));
              }
            }
          });
          child.stdin.on("error", () => {});
          child.stdin.end(Buffer.concat(chunks));
        });
        return json(res, 200, output);
      } finally {
        running--;
      }
    }
    if (req.method !== "GET" && req.method !== "HEAD")
      return json(res, 405, { error: "Méthode non autorisée" });
    let file = resolve(root, "." + decodeURIComponent(path));
    if (file !== root && !file.startsWith(root + sep))
      return json(res, 403, { error: "Chemin interdit" });
    try {
      if (!(await stat(file)).isFile()) file = resolve(root, "index.html");
    } catch {
      if (extname(path)) return json(res, 404, { error: "Fichier absent" });
      file = resolve(root, "index.html");
    }
    const body = await readFile(file);
    const type =
      {
        ".html": "text/html; charset=utf-8",
        ".js": "text/javascript; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".svg": "image/svg+xml",
        ".png": "image/png",
        ".woff": "font/woff",
        ".woff2": "font/woff2",
        ".webmanifest": "application/manifest+json",
      }[extname(file)] || "application/octet-stream";
    res.writeHead(200, {
      "Content-Type": type,
      "Cache-Control": file.includes(sep + "assets" + sep)
        ? "public,max-age=31536000,immutable"
        : "no-cache",
      "X-Content-Type-Options": "nosniff",
    });
    res.end(req.method === "HEAD" ? undefined : body);
  } catch (e) {
    if (!res.headersSent) json(res, 500, { error: e.message });
    else res.end();
  }
});
server.requestTimeout = 30000;
server.listen(port, production ? "0.0.0.0" : "127.0.0.1", () =>
  console.log(`Logger + Garmin : http://localhost:${port}`),
);
