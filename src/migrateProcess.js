import { openConnection } from "./mongo.js";
import { fetchProcessGraph } from "./fetchProcessGraph.js";
import { ENVIRONMENTS } from "./environments.js";
import { ObjectId } from "mongodb";
import inquirer from "inquirer";

/**
 * Copia um processo, preservando os mesmos _id, para outro ambiente.
 */
export async function migrateProcess(processName, srcKey, dstKey) {
    const srcEnv = ENVIRONMENTS[srcKey];
    const dstEnv = ENVIRONMENTS[dstKey];
    if (!srcEnv || !dstEnv) throw new Error("Ambiente inválido");

    // 1. abre conexões
    const { client: srcCli, db: srcDb } = await openConnection(srcEnv);
    const { client: dstCli, db: dstDb } = await openConnection(dstEnv);

    try {
        // 2. busca todo o “grafo” de documentos no ambiente fonte (srcDb)
        const {
            process,
            steps,
            tasks,
            rulesByType,
            parameters
        } = await fetchProcessGraph(processName, srcDb);

        if (!process) {
            console.error(`Processo "${processName}" não encontrado em ${srcEnv.label}`);
            return;
        }

        // Tratativa caso houver processo já existente (nome igual, porém ID diferente)
        const existing = await dstDb.collection("processes").findOne({ name: process.name });

        if (existing && existing._id.toString() !== process._id.toString()) {

            const { action } = await inquirer.prompt([
                {
                    type: "list",
                    name: "action",
                    message: `Processo "${process.name}" já existe em ${dstEnv.label} com _id ${existing._id}. O que deseja fazer?`,
                    choices: [
                        { name: "1 – Sobrescrever (delete + insert)", value: "overwrite" },
                        { name: "2 – Pular migração desse processo", value: "skip" },
                        { name: "3 – Cancelar tudo", value: "cancel" }
                    ]
                }
            ]);

            if (action === "cancel") {
                console.log("Migração cancelada pelo usuário.");
                await srcCli.close(); await dstCli.close();
                return;
            }

            if (action === "skip") {
                console.log(`Processo "${process.name}" ignorado – já existia no destino.`);
                return;
            }

            if (action === "overwrite") {
                console.log("Sobrescrevendo processo existente…");

                const stepIds = existing.steps.map(s => s.step);
                const stepDocs = await dstDb.collection("steps")
                    .find({ _id: { $in: stepIds } })
                    .toArray();

                const taskIds = new Set();

                for (const step of stepDocs) {
                    (step.actions || []).forEach(action => {
                        if (action.type === "tasks" && action.ref) {
                            taskIds.add(action.ref.$oid || action.ref);
                        }
                    })
                }

                const taskDocs = await dstDb.collection("tasks")
                    .find({ _id: { $in: [...taskIds].map(id => new ObjectId(id)) } })
                    .toArray();

                const ruleRefsByType = {};
                for (const t of taskDocs) {
                    const { ref, type } = t.rule || {};
                    if (!ref || !type) continue;
                    ruleRefsByType[type] ??= new Set();
                    ruleRefsByType[type].add(ref.toString());
                }

                await dstDb.collection("processes").deleteOne({ _id: existing._id });
                await dstDb.collection("steps").deleteMany({ _id: { $in: stepIds } });
                await dstDb.collection("tasks").deleteMany({ _id: { $in: [...taskIds].map(id => new ObjectId(id)) } });

                for (const [type, ids] of Object.entries(ruleRefsByType)) {
                    await dstDb.collection(type).deleteMany({
                        _id: { $in: [...ids].map(id => new ObjectId(id)) }
                    });
                }
            }
        }

        // 3. upsert helper (Fazer bulks de inserção para o mongoDB)
        const upsertMany = async (colName, docs) => {
            if (!docs.length) return;
            const bulk = dstDb.collection(colName).initializeUnorderedBulkOp();
            docs.forEach(d => {
                bulk.find({ _id: d._id }).upsert().replaceOne(d);
            });
            await bulk.execute();
        };

        // 4. grava no destino escolhido (ordem de dependência: parâmetros → regras → tasks → steps → process)
        await upsertMany("parameters", parameters);
        for (const [type, docs] of Object.entries(rulesByType)) {
            await upsertMany(type, docs);
        }
        await upsertMany("tasks", tasks);
        await upsertMany("steps", steps);
        await upsertMany("processes", [process]);

        console.log(`Processo "${processName}" migrado de ${srcEnv.label} → ${dstEnv.label}`);
    } finally {
        await srcCli.close();
        await dstCli.close();
    }
}
