import { exportProcess } from "./src/exportProcess.js";

const [,, processName, tenantId] = process.argv;

if (!processName || !tenantId) {
  console.error("Informe o nome do processo. Exemplo: node index.js generationBillings");
  process.exit(1);
}

exportProcess(processName, tenantId)
  .then(() => console.log("Exportação concluída."))
  .catch(err => {
    console.error("Erro ao exportar:", err.message);
    process.exit(1);
  });
