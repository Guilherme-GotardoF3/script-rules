import { getDb } from "./mongo.js";
import { saveJson, clearDirIfExistis, extractRubricsGroupIds } from "./utils.js";
import { ObjectId } from "mongodb";
import path from "path";

export async function exportProcess(processName, area, envKey) {
    console.log(`Procurando processo "${processName}"`);

    const baseDir = `src-mdr-components/commons/${area}`;
    const db = await getDb(envKey);

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

        const exportedParentTasks = new Set();

        let rubricMode = tasks.some(t => t.rule?.type === "ordered_reference_lists");

        for (const task of tasks) {
            const rule = task.rule;
            const ruleId = rule?.ref;
            const ruleType = rule?.type;
            const taskType = task?.type;

            if (!ruleId || !ruleType || !["queries", "write_commands", "ordered_reference_lists", "api_requests", "conditions"].includes(ruleType)) {
                console.warn(`Task "${task.name}" não possui regra válida (ruleId=${ruleId}, type=${ruleType})`);
                continue;
            }

            const ruleDoc = await db.collection(ruleType).findOne({ _id: ruleId });

            if (!ruleDoc) {
                console.warn(`Documento da regra ${ruleId} não encontrado na collection "${ruleType}" para a task "${task.name}"`);
                continue;
            }

            if (taskType == "child") {
                const parentId = task.childConfig?.parentTask?._id;

                if (parentId) {
                    const parentTask = await db.collection("tasks").findOne({ _id: parentId });

                    if (parentTask) {
                        const parentKey = parentTask._id.toString();

                        if (!exportedParentTasks.has(parentKey)) {
                            exportedParentTasks.add(parentKey);

                            await saveJson("src-mdr-components/commons/parent-tasks", parentTask.name, parentTask);
                        }
                    } else {
                        console.warn(`Parent task com ID ${parentId} não encontrada para a task "${task.name}"`);
                    }
                } else {
                    console.warn(`Task "${task.name}" é do tipo "child" mas não possui parentTask._id`);
                }
            }

            await exportRuleWithFormat(ruleDoc, ruleType, task, path.join(stepDir, "tasks", ruleType), baseDir, db, rubricMode)
        }
    }
}

async function exportRuleWithFormat(ruleDoc, ruleType, task, outputDir, baseDir, db, rubricMode) {
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

        if (rubricMode) {
            console.log("Possui ordered reference List");

            const aggObj = typeof ruleDoc.query === "string"
                ? JSON.parse(ruleDoc.query)
                : ruleDoc.query;

            const groupIds = await extractRubricsGroupIds(aggObj, db);
            console.log("Ids extraídos:", groupIds);

            const exportedQueries = new Set();

            for (const gid of groupIds) {
                const rubrics = await db.collection("rubrics").find({
                    "support.group._id": gid,
                    "rule.ref": { $ne: null }
                }).toArray();

                for (const rub of rubrics) {
                    const qId = rub.rule.ref;
                    if (exportedQueries.has(qId.toString())) continue;

                    const linkedQuery = await db.collection("queries").findOne({ _id: qId });
                    if (!linkedQuery) {
                        console.warn("Query não encontrada com Id:", qId);
                        continue;
                    }

                    const queryTasks = await db.collection("tasks")
                        .find({ "rule.ref": qId })
                        .toArray();

                    if (queryTasks.length === 0) {
                        console.warn(`Nenhuma task referencia a query ${linkedQuery.name}; gerando stub.`);
                        const stubTask = {
                            _id: "TASK NÃO ENCONTRADA NO BANCO DE DADOS",
                            name: linkedQuery.name,
                            description: linkedQuery.description,
                            outputName: "",
                            rule: { ref: linkedQuery._id, type: "queries" },
                            type: "common"
                        };
                        await exportRuleWithFormat(
                            linkedQuery, "queries", stubTask,
                            outputDir, baseDir, db, /*rubricMode*/ false
                        );
                    } else {
                        for (const realTask of queryTasks) {
                            await exportRuleWithFormat(
                                linkedQuery, "queries", realTask,
                                outputDir, baseDir, db, /*rubricMode*/ false
                            );
                        }
                    }

                    exportedQueries.add(qId.toString());
                    console.log("Query exportada:", linkedQuery.name);
                }
            }
        }
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

    if (ruleType === "write_commands") {
        const enriched = {
            ...enrichedBase,
            main_collection: ruleDoc.table || ruleDoc.collection || "",
            Command: typeof ruleDoc.command === "string" ? JSON.parse(ruleDoc.command) : ruleDoc.command
        };
        await saveJson(`${baseDir}/${outputDir}`, enriched.name, enriched);
    }

    if (ruleType === "api_requests") {

        var body = {};

        if (!(ruleDoc.body == null)) {
            body = {
                type: ruleDoc.body.type,
                data: typeof ruleDoc.body.data === "string" ? JSON.parse(ruleDoc.body.data) : ruleDoc.body.data
            }
        }

        const enriched = {
            ...enrichedBase,
            method: ruleDoc.method,
            headers: ruleDoc.headers,
            pathParameters: ruleDoc.pathParameters,
            queryParameters: ruleDoc.queryParameters,
            Url: ruleDoc.url,
            Body: body
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
            if (value.startsWith("$.") && !(value.startsWith("$.$$") || value.startsWith("$.opt") || value.startsWith("$.otp"))) {
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

export async function updateParameters(envKey) {
    const db = await getDb(envKey);

    const parameters = await db.collection("parameters").find().toArray();
    const parametersMap = new Map(parameters.map(p => [String(p._id), p]));

    const parameterIds = parameters.map(p => p._id);

    const tasks = await db.collection("tasks").find({
        "rule.ref": { $in: parameterIds }
    }).toArray();

    for (const task of tasks) {
        const ruleId = task?.rule?.ref;
        const param = parametersMap.get(String(ruleId));
        if (!param) continue;

        const parameter = {
            _id: task._id,
            type: {
                _id: param._id,
                name: "parameters"
            },
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
