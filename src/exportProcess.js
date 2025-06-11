import { getDb } from "./mongo.js";
import { saveJson, clearDirIfExistis } from "./utils.js";
import { ObjectId } from "mongodb";
import path from "path";

export async function exportProcess(processName, area) {
    console.log(`Procurando processo "${processName}"`);

    const baseDir = `src-mdr-components/commons/${area}`;
    const db = await getDb();

    const process = await db.collection("processes").findOne({ name: processName });
    if (!process) throw new Error(`Processo "${processName}" não encontrado`);

    const processDir = path.join("processes", process.name);
    clearDirIfExistis(path.join(baseDir, processDir));

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

            if (!ruleId || !ruleType || !["queries", "write_commands", "ordered_reference_lists", "api_requests", "conditions"].includes(ruleType)) {
                console.warn(`Task "${task.name}" não possui regra válida (ruleId=${ruleId}, type=${ruleType})`);
                continue;
            }

            const ruleDoc = await db.collection(ruleType).findOne({ _id: ruleId });

            if (!ruleDoc) {
                console.warn(`Documento da regra ${ruleId} não encontrado na collection "${ruleType}" para a task "${task.name}"`);
                continue;
            }

            await exportRuleWithFormat(ruleDoc, ruleType, task, path.join(stepDir, "tasks", ruleType), baseDir, db);
        }
    }
}

async function exportRuleWithFormat(ruleDoc, ruleType, task, outputDir, baseDir, db) {
    const enrichedBase = {
        _id: task._id,
        type: {
            _id: ruleDoc._id,
            name: ruleType
        },
        name: task.name,
        description: ruleDoc.description || "",
    };

    if (ruleType === "queries") {
        const systemInputs = extractSystemActions(JSON.parse(ruleDoc.query));
        const parametersIds = extractParametersIds(JSON.parse(ruleDoc.query));
        const parametersDocs = await db
            .collection("parameters")
            .find({ _id: { $in: parametersIds.map(id => new ObjectId(id)) } })
            .toArray();

        const inputParameters = [
            ...parametersDocs.map(param => ({
                name: param.name || "",
                type: "Parameter",
                description: param.description,
                value: param.value
            })),
            ...systemInputs
        ];

        const collections = extractLookupCollections(JSON.parse(ruleDoc.query));

        const enriched = {
            ...enrichedBase,
            main_collection: ruleDoc.table || ruleDoc.collection || "",
            output_name: task.outputName || "",
            fixed_value: systemInputs.length > 0 || parametersIds > 0 ? true : false,
            input_parameters: inputParameters,
            collections: collections,
            output: {},
            Aggregation: typeof ruleDoc.query === "string" ? JSON.parse(ruleDoc.query) : ruleDoc.query
        };
        await saveJson(`${baseDir}/${outputDir}`, enriched.name, enriched);
    }

    if (ruleType === "write_commands") {
        const enriched = {
            ...enrichedBase,
            main_collection: ruleDoc.table || ruleDoc.collection || "",
            Command: typeof ruleDoc.command === "string" ? JSON.parse(ruleDoc.command) : ruleDoc.command
        };
        await saveJson(`${baseDir}/${outputDir}`, enriched.name, enriched);
    }

    if (ruleType === "ordered_reference_lists") {
        const enriched = {
            ...enrichedBase,
            outputName: task.outputName,
            rulePath: ruleDoc.rulePath,
            referenceListPath: ruleDoc.referenceListPath
        };
        await saveJson(`${baseDir}/${outputDir}`, enriched.name, enriched);
    }


    if (ruleType === "api_requests") {
        const enriched = {
            ...enrichedBase,
            method: ruleDoc.method,
            headers: ruleDoc.headers,
            pathParameters: ruleDoc.pathParameters,
            queryParameters: ruleDoc.queryParameters,
            Url: ruleDoc.url,
            Body: {
                type: ruleDoc.body.type,
                data: typeof ruleDoc.body.data === "string" ? JSON.parse(ruleDoc.body.data) : ruleDoc.body.data
            }
        };
        await saveJson(`${baseDir}/${outputDir}`, enriched.name, enriched);
    }


    if (ruleType === "conditions") {
        const enriched = {
            ...enrichedBase,
            Options: ruleDoc.path,
            Options: ruleDoc.options
        };
        await saveJson(`${baseDir}/${outputDir}`, enriched.name, enriched);
    }
}

function extractParametersIds(aggregation) {
    const ids = new Set();

    function search(value, path = "") {
        if (typeof value === "string" && value.startsWith("p:")) {
            const id = value.substring(2);
            if (ObjectId.isValid(id)) {
                ids.add(id);
                console.log(`Parâmetro encontrado em ${path}`, id);
            } else {
                console.warn("Id inválido de parâmetro");
            }
        } else if (Array.isArray(value)) {
            value.forEach((item, index) => search(item, `${path}[${index}]`));
        } else if (typeof value === "object" && value !== null) {
            for (const [key, val] of Object.entries(value)) {
                search(val, path ? `${path}.${key}` : key);
            }
        }
    }

    search(aggregation);
    return [...ids];
}

function extractLookupCollections(aggregation) {
    const collections = new Set();

    function search(value) {
        if (Array.isArray(value)) {
            value.forEach(search);
        } else if (typeof value === "object" && value !== null) {
            if (value.$lookup && typeof value.$lookup === "object") {
                const from = value.$lookup.from;
                if (typeof from === "string") {
                    collections.add(from);
                }
            }

            for (const val of Object.values(value)) {
                search(val);
            }
        }
    }

    search(aggregation);
    return [...collections];
}

function extractSystemActions(aggregation) {
    const systemActions = new Set();

    function search(value, path = "") {
        if (typeof value === "string") {
            if (value.startsWith("$.") && !(value.startsWith("$.$$") || value.startsWith("$.opt") || value.startsWith("$.otp")))  {
                systemActions.add(value);
                console.log(`Ação do sistema encontrada em ${path}`, value);
            }
        } else if (Array.isArray(value)) {
            value.forEach((item, index) => search(item, `${path}[${index}]`));
        } else if (typeof value === "object" && value !== null) {
            for (const [key, val] of Object.entries(value)) {
                search(val, path ? `${path}.${key}` : key);
            }
        }
    }

    search(aggregation);
    return [...systemActions].map(action => ({
        name: action.substring(2),
        type: "Action System",
        description: "Variável do sistema usada na agregação"
    }));
}

export async function updateParameters() {
    const db = await getDb();
    const allParameters = await db.collection("parameters").find().toArray();

    for (const param of allParameters) {
        const parameter = {
            _id: param._id,
            name: param.name,
            description: param.description,
            data: {
                value: param.value,
                type: param.type,
                isDefault: param.isDefault
            }
        };
        await saveJson("src-mdr-components/commons/parameters", param.name, parameter);
    }
}