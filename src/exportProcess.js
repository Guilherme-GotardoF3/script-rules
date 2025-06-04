import { getDb } from "./mongo.js";
import { saveJson } from "./utils.js";
import { ObjectId } from "mongodb";

export async function exportProcess(processName, tenantId) {

    console.log(`Procurando processo "${processName}" no banco "${tenantId}"`);

    const db = await getDb();

    // Primeiro passo irei realizar a busca do processo passado
    const process = await db.collection("processes").findOne({
        name: processName,
    });

    if (!process) throw new Error(`Processo "${processName}" não encontrado`);

    await saveJson("processes", process.name, process);


    // Buscar cada step no banco de dados
    const stepIds = process.steps.map(s => s.step);
    const steps = await db.collection("steps").find({
        _id: {
            $in: stepIds
        }
    }).toArray();

    for (const step of steps) {
        await saveJson("steps", step.name, step);
    }

    console.log(`Processo finalizado de ${processName} com ${steps.length} step(s).`);

    // Procurando cada task específica retirada dos steps
    const taskIds = steps.flatMap(step =>
        (step.actions || [])
            .filter(action => action.type === "tasks" && action.ref)
            .map(action => action.ref.$oid || action.ref)
    );

    const uniqueTaskIds = [...new Set(taskIds.map(id => id.toString()))].map(id => new ObjectId(id));

    const tasks = await db.collection("tasks").find({ _id: { $in: uniqueTaskIds } }).toArray();

    for (const task of tasks) {
        await saveJson("tasks", task.name || task._id.toString(), task);
    }

    console.log(`Exportadas ${tasks.length} task(s)`);

    // Verificar agora se a task corresponde a uma query ou write_command
    for (const task of tasks) {
        await saveJson("tasks", task.name, task);

        const rule = task.rule;
        const ruleId = rule?.ref;
        const ruleType = rule?.type;

        if (!ruleId || !ruleType || !["queries", "write_commands"].includes(ruleType)) {
            console.warn(`Task "${task.name}" não possui regra válida (ruleId=${ruleId}, type=${ruleType})`);
            continue;
        }

        const ruleDoc = await db.collection(ruleType).findOne({ _id: ruleId });

        if (!ruleDoc) {
            console.warn(`Documento da regra ${ruleId} não encontrado na collection "${ruleType}" para a task "${task.name}"`);
            continue;
        }

        await exportRuleWithFormat(ruleDoc, ruleType, task);
        // await saveJson(ruleType, ruleDoc.name, ruleDoc);
    }

}

async function exportRuleWithFormat(ruleDoc, ruleType, task) {
    const enrichedBase = {
        _id: task._id,
        type: {
            _id: ruleDoc._id,
            name: ruleType === "queries" ? "query" : "write_command"
        },
        name: `${task.name}`,
        description: ruleDoc.description || "",
        main_collection: ruleDoc.table || ruleDoc.collection || ""
    };

    if (ruleType === "queries") {
        const enriched = {
            ...enrichedBase,
            output_name: task.outputName || "",
            fixed_value: true,
            input_parameters: [
                {
                    name: "",
                    type: "",
                    description: ""
                }
            ],
            collections: [],
            output: {},
            Aggregation: typeof ruleDoc.query === "string" ? JSON.parse(ruleDoc.query) : ruleDoc.query
        };

        await saveJson("queries", enriched.name, enriched);
    } else {
        const enriched = {
            ...enrichedBase,
            Command: typeof ruleDoc.command === "string" ? JSON.parse(ruleDoc.command) : ruleDoc.command
        };

        await saveJson("write_commands", enriched.name, enriched);
    }
}
