import fs from "fs";
import path from "path";
import { getDb } from "./mongo.js";

const BASE_DIR = "src-mdr-components/commons";

export async function verifyDatabase() {
  const db = await getDb();
  const dbProcesses = await db.collection("processes").find().toArray();
  const dbProcessNames = dbProcesses.map(p => p.name);

  const missingInFilesystem = [];
  const duplicatedInFilesystem = [];
  const unknownInFilesystem = [];

  console.log("\n Verificando pastas de processos nas áreas...");

  const areas = fs.readdirSync(BASE_DIR, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);

  for (const area of areas) {
    const processPath = path.join(BASE_DIR, area, "processes");
    if (!fs.existsSync(processPath)) continue;

    const folders = fs.readdirSync(processPath)
      .filter(name => fs.statSync(path.join(processPath, name)).isDirectory());

    const seen = new Set();

    for (const folder of folders) {
      if (seen.has(folder)) {
        duplicatedInFilesystem.push({ area, name: folder });
      } else {
        seen.add(folder);
      }

      if (!dbProcessNames.includes(folder)) {
        unknownInFilesystem.push({ area, name: folder });
      }
    }
  }

  // Verifica quais do banco não estão versionados
  const versionedProcesses = [];

  for (const area of areas) {
    const processPath = path.join(BASE_DIR, area, "processes");
    if (!fs.existsSync(processPath)) continue;

    const folders = fs.readdirSync(processPath)
      .filter(name => fs.statSync(path.join(processPath, name)).isDirectory());

    versionedProcesses.push(...folders);
  }

  for (const dbName of dbProcessNames) {
    if (!versionedProcesses.includes(dbName)) {
      missingInFilesystem.push(dbName);
    }
  }

  console.log("\n Resultados da verificação:\n");

  if (duplicatedInFilesystem.length > 0) {
    console.log("  Processos duplicados por pasta:");
    duplicatedInFilesystem.forEach(p => console.log(`- ${p.name} (área: ${p.area})`));
  }

  if (unknownInFilesystem.length > 0) {
    console.log("\n Pastas que não correspondem a nenhum processo no banco:");
    unknownInFilesystem.forEach(p => console.log(`- ${p.name} (área: ${p.area})`));
  }

  if (missingInFilesystem.length > 0) {
    console.log("\n Processos que existem no banco, mas não estão versionados:");
    missingInFilesystem.forEach(p => console.log(`- ${p}`));
  }

  if (
    duplicatedInFilesystem.length === 0 &&
    unknownInFilesystem.length === 0 &&
    missingInFilesystem.length === 0
  ) {
    console.log(" Todos os processos estão corretamente versionados!");
  }

  console.log("\n Verificação concluída.");
}
