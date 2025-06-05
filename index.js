import { exportProcess } from "./src/exportProcess.js";
import inquirer from "inquirer";

const AREAS = {
  "1": "Arrecadacao",
  "2": "Relatorios",
  "3": "Folha"
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
