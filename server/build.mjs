import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { resolve, delimiter } from "node:path";
const compiler =
  process.env.JAVAC_BIN ||
  (process.env.JAVA_HOME
    ? resolve(process.env.JAVA_HOME, "bin/javac")
    : process.platform === "win32" &&
        existsSync("C:/Program Files/Android/Android Studio/jbr/bin/javac.exe")
      ? "C:/Program Files/Android/Android Studio/jbr/bin/javac.exe"
      : "javac");
mkdirSync("server/classes", { recursive: true });
const result = spawnSync(
  compiler,
  [
    "--release",
    "8",
    "-cp",
    "server/lib/fit-21.214.0.jar",
    "-d",
    "server/classes",
    "server/MonitoringBridge.java",
  ],
  { stdio: "inherit" },
);
if (result.error) throw result.error;
process.exit(result.status ?? 1);
