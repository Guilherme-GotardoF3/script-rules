import { exportProcess } from "./src/exportProcess.js";
import readline from "readline";

function ask(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise(resolve =>
    rl.question(question, answer => {
      rl.close();
      resolve(answer.trim());
    })
  );
}

async function main() {
  let [, , processName] = process.argv;

  if (!processName) {
    console.log("Exportador de Processos MongoDB\n");
    console.log(`Conectado no banco ${process.env.DB_NAME}`);

    if (!processName) {
      processName = await ask("Digite o nome do processo que deseja exportar: ");
    }
  }

  try {
    await exportProcess(processName);
    console.log("\n Exportação finalizada com sucesso!");
    process.exit(0)
  } catch (err) {
    console.error("\n Erro ao exportar:", err.message);
    process.exit(1);
  }
}

main();
