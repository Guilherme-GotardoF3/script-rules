import inquirer from "inquirer";

import { ENVIRONMENTS } from "./src/environments.js";
import { exportProcess } from "./src/exportProcess.js";
import { updateParameters } from "./src/exportProcess.js";
import { verifyExportedProcesses } from "./src/verifyProcesses.js";
import { verifyDatabase } from "./src/verifyDatabase.js";
import { migrateProcess } from "./src/migrateProcess.js";

const ENV_CHOICES = Object.entries(ENVIRONMENTS).map(([k, v]) => ({
  name: `${v.label}  [db: ${v.db}]`,
  value: k
}));

const MENU_CHOICES = [
  new inquirer.Separator("── Exportação ──"),
  { name: "1 - contribution-collection",         value: "contribution-collection" },
  { name: "2 - payroll",                         value: "payroll" },
  { name: "3 - ocean",                           value: "ocean" },
  { name: "4 - institutes",                      value: "institutes" },
  { name: "5 - billing",                         value: "billing" },
  { name: "6 - patrimony",                       value: "patrimony" },
  { name: "7 - benefit-granting",                value: "benefit-granting" },
  { name: "8 - registration",                    value: "registration" },
  { name: "9 - legal-obligations",               value: "legal-obligations" },
  new inquirer.Separator("── Utilidades ──"),
  { name: "p - Update Parameters",               value: "updateParameters" },
  { name: "v - Verification Processes",          value: "verifyProcesses" },
  { name: "b - Verification Database",           value: "verifyDatabase" },
  { name: "m - Migrate Processes",               value: "migrate" },
  new inquirer.Separator(),
  { name: "x - Sair",                            value: "exit" }
];

(async () => {
  /* 1. Ambiente (antes de tocar no banco) */
  const { envKey } = await inquirer.prompt({
    type: "list",
    name: "envKey",
    message: "Qual ambiente deseja usar?",
    choices: ENV_CHOICES
  });

  const env = ENVIRONMENTS[envKey];
  process.env.MONGO_URI = env.uri;
  process.env.DB_NAME = env.db;
  process.env.CURRENT_ENV_KEY = envKey;

  const { action } = await inquirer.prompt({
    type: "list",
    name: "action",
    message: "O que você quer fazer?",
    choices: MENU_CHOICES
  });

  switch (action) {
    case "exit":
      console.log("Encerrando…");
      process.exit(0);
      
    case "updateParameters":
      console.log(`Atualizando parâmetros em ${env.label}…`);
      await updateParameters();
      process.exit(0);
      
    case "verifyProcesses":
      console.log("Verificando processos já exportados…");
      await verifyExportedProcesses();
      process.exit(0);
      
    case "verifyDatabase":
      console.log("Verificando consistência de processos no banco…");
      await verifyDatabase();
      process.exit(0);

    case "migrate": {
      const { srcEnv, dstEnv } = await inquirer.prompt([
        { type: "list", name: "srcEnv", message: "Ambiente *fonte*:", choices: ENV_CHOICES },
        { type: "list", name: "dstEnv", message: "Ambiente *destino*:", choices: ENV_CHOICES }
      ]);
      if (srcEnv === dstEnv) {
        console.error("Fonte e destino não podem ser o mesmo ambiente.");
        process.exit(0);
      }

      const { processName } = await inquirer.prompt({
        type: "input", name: "processName", message: "Nome do processo a migrar:"
      });

      await migrateProcess(processName.trim(), srcEnv, dstEnv);
      process.exit(0);
    }

    default: {
      const area = action;
      const { processNames } = await inquirer.prompt({
        type: "input",
        name: "processNames",
        message: "Digite os nomes dos processos separados por vírgula:"
      });

      const names = processNames
        .split(",")
        .map(s => s.trim())
        .filter(Boolean);

      for (const name of names) {
        console.log(`Exportando processo “${name}” da área ${area}…`);
        await exportProcess(name, area);
      }
      console.log("Exportação concluída com sucesso.");
      process.exit(0);
    }
  }
})();