import { exportProcess } from "./src/exportProcess.js";
import inquirer from "inquirer";

const AREAS = {
  "1": "contribution-collection",
  "2": "payroll",
  "3": "ocean",
  "4": "institutes",
  "5": "third-portal",
  "x": "Sair"
};

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

  // Verifica se o usuário escolheu "Sair"
  if (areaChoice === "Sair") {
    console.log("Encerrando...");
    process.exit(0);
  }

  const { processName } = await inquirer.prompt([
    {
      type: "input",
      name: "processName",
      message: "Digite o nome do processo que deseja exportar:"
    }
  ]);

  await exportProcess(processName, areaChoice);
  console.log("Exportação concluída com sucesso.");
  process.exit(0);
})();