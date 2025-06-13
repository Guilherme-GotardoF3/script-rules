import { exportProcess, updateParameters } from "./src/exportProcess.js";
import { verifyExportedProcesses } from "./src/verifyProcesses.js";
import { verifyDatabase } from "./src/verifyDatabase.js"
import inquirer from "inquirer";

const AREAS = {
  "1": "contribution-collection",
  "2": "payroll",
  "3": "ocean",
  "4": "institutes",
  "5": "third-portal",
  "6": "billing",
  "7": "patrimony",
  "8": "benefit-granting",
  "9": "registration",
  "10": "legal-obligations",
  "p": "Update Parameters",
  "v": "Verification Processes",
  "b": "Verification Database",
  "x": "Sair"
};

const VALID_AREAS = Object.values(AREAS).filter(
  a => !["Update Parameters", "Verification Processes", "Sair"].includes(a)
);

(async () => {
  const { areaChoice } = await inquirer.prompt([
    {
      type: "list",
      name: "areaChoice",
      message: "Para qual área deseja exportar o processo?",
      choices: Object.entries(AREAS).map(([key, value]) => ({
        name: `${key} - ${value}`,
        value: value
      }))
    }
  ]);

  if (areaChoice === "Sair") {
    console.log("Encerrando...");
    process.exit(0);
  }

  if (areaChoice === "Update Parameters") {
    console.log(`Iniciando atualização de parâmetros, banco atual ${process.env.DB_NAME}`);
    await updateParameters();
    process.exit(0);
  }

  if (areaChoice === "Verification Processes") {
    console.log("Iniciando verificação de processos exportados...");
    await verifyExportedProcesses();
    process.exit(0);
  }

  if (areaChoice === "Verification Database") {
    console.log("Iniciando verificação de processos no banco de dados...");
    await verifyDatabase();
    process.exit(0);
  }

  if (!VALID_AREAS.includes(areaChoice)) {
    console.error("Opção inválida.");
    process.exit(1);
  }

  const { processNames } = await inquirer.prompt([
    {
      type: "input",
      name: "processNames",
      message: "Digite os nomes dos processos separados por vírgula:"
    }
  ]);

  const names = processNames
    .split(",")
    .map(name => name.trim())
    .filter(Boolean);

  for (const name of names) {
    console.log(`Exportando processo: ${name}`);
    await exportProcess(name, areaChoice);
  }

  console.log("Exportação concluída com sucesso.");
  process.exit(0);
  
})();
