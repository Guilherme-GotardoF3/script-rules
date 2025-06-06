import fs from "fs-extra";
import path from "path";

export async function saveJson(dir, fileName, data) {
  const outputDir = path.resolve(dir);
  await fs.ensureDir(outputDir);
  const outputPath = path.join(outputDir, `${fileName}.json`);
  await fs.writeJson(outputPath, data, { spaces: 2 });
  console.log(`Saved: ${outputPath}`);
}

export function clearDirIfExistis(dirPath) {
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
    console.log(`Processo "${dirPath}" já exstia e foi removido.`);
  }
}