import { getDb } from "./mongo.js";
import { saveJson } from "./utils.js";
import { ObjectId } from "mongodb";
import path from "path";

export async function exportProcess(processName, area) {
    console.log(`Procurando processo "${processName}"`);

    const baseDir = `${area}`;
    const db = await getDb();

    const process = await db.collection("processes").findOne({ name: processName });
    if (!process) throw new Error(`Processo "${processName}" não encontrado`);

    const processDir = path.join("processes", process.name);
    await saveJson(`${baseDir}/${processDir}`, process.name, process);

    const stepIds = process.steps.map(s => s.step);
    const steps = await db.collection("steps").find({ _id: { $in: stepIds } }).toArray();

    console.log(`Processo ${processName} encontrado com ${steps.length} step(s).`);

    for (const step of steps) {
        const stepDir = path.join(processDir, "steps", step.name);
        await saveJson(`${baseDir}/${stepDir}`, step.name, step);

        const taskIds = (step.actions || [])
            .filter(action => action.type === "tasks" && action.ref)
            .map(action => action.ref.$oid || action.ref);

        const uniqueTaskIds = [...new Set(taskIds.map(id => id.toString()))].map(id => new ObjectId(id));
        const tasks = await db.collection("tasks").find({ _id: { $in: uniqueTaskIds } }).toArray();

        for (const task of tasks) {
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

            await exportRuleWithFormat(ruleDoc, ruleType, task, path.join(stepDir, ruleType), baseDir);
        }
    }
}

async function exportRuleWithFormat(ruleDoc, ruleType, task, outputDir, baseDir) {
    const enrichedBase = {
        _id: task._id,
        type: {
            _id: ruleDoc._id,
            name: ruleType === "queries" ? "query" : "write_command"
        },
        name: task.name,
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
        await saveJson(`${baseDir}/${outputDir}`, enriched.name, enriched);
    } else {
        const enriched = {
            ...enrichedBase,
            Command: typeof ruleDoc.command === "string" ? JSON.parse(ruleDoc.command) : ruleDoc.command
        };
        await saveJson(`${baseDir}/${outputDir}`, enriched.name, enriched);
    }
}
