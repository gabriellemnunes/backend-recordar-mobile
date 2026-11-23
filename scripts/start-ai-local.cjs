const path = require("node:path");
const fs = require("node:fs");
const { spawn } = require("node:child_process");
require("dotenv").config();
const binary = process.env.OLLAMA_BIN || "ollama";
const data = path.resolve(process.env.OLLAMA_DATA_DIR || ".recordar-ai");
const profile = path.join(data, "perfil");
fs.mkdirSync(profile, { recursive: true });
const child = spawn(
  binary,
  process.argv.slice(2).length ? process.argv.slice(2) : ["serve"],
  {
    windowsHide: true,
    stdio: "inherit",
    // Perfil exclusivo deste processo portátil; não modifica o Windows nem outros apps.
    env: {
      ...process.env,
      USERPROFILE: profile,
      OLLAMA_MODELS: path.join(data, "modelos"),
      OLLAMA_HOST: process.env.OLLAMA_URL || "http://127.0.0.1:11434",
      OLLAMA_NO_CLOUD: "1",
    },
  },
);
child.on("error", () => {
  console.error(
    "Ollama não encontrado. Configure OLLAMA_BIN no .env ou instale o Ollama oficial.",
  );
  process.exitCode = 1;
});
child.on("exit", (code) => (process.exitCode = code || 0));
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill());
