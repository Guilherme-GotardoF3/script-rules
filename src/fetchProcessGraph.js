import { ObjectId } from "mongodb";

export async function fetchProcessGraph(processName, db) {
  /* BUSCAR PROCESSO NO BANCO DE DADOS ------------------------------------- */
  const process = await db.collection("processes").findOne({ name: processName });
  if (!process) return null;

  /* STEP 1 > Steps -------------------------------------------------------- */
  const stepIds = process.steps.map(s => s.step);
  const steps   = await db.collection("steps")
      .find({ _id: { $in: stepIds } })
      .toArray();

  /* STEP 2 > Tasks (inclui parent‑tasks) ---------------------------------- */
  const taskIds = new Set();
  steps.forEach(st => {
    (st.actions || []).forEach(a => {
      if (a.type === "tasks" && a.ref) taskIds.add(a.ref.$oid || a.ref);
    });
  });
  const tasks = await db.collection("tasks")
      .find({ _id: { $in: [...taskIds].map(id => new ObjectId(id)) } })
      .toArray();

  /* parent‑tasks ----------------------------------------------------------- */
  const childTasks = tasks.filter(t => t.type === "child");
  const parentIds  = childTasks
      .map(t => t.childConfig?.parentTask?._id)
      .filter(Boolean);
  const parentTasks = await db.collection("tasks")
      .find({ _id: { $in: parentIds } })
      .toArray();

  const allTasks = [...tasks, ...parentTasks];

  /* STEP 3 > Regras -------------------------------------------------------- */
  const rulesByType = {};
  for (const t of allTasks) {
    const { ref, type } = t.rule || {};
    if (!ref) continue;
    rulesByType[type] ??= new Map();
    if (!rulesByType[type].has(ref.toString())) {
      const doc = await db.collection(type).findOne({ _id: ref });
      if (doc) rulesByType[type].set(ref.toString(), doc);
    }
  }

  /* STEP 4 > Parâmetros usados em queries ---------------------------------- */
  const paramIds = new Set();
  for (const docMap of Object.values(rulesByType)) {
    for (const r of docMap.values()) {
      if (r.query && typeof r.query === "string") {
        (r.query.match(/"p:([0-9a-f]{24})"/g) || []).forEach(m => {
          paramIds.add(m.slice(3, 27));
        });
      }
    }
  }
  const parameters = await db.collection("parameters")
      .find({ _id: { $in: [...paramIds].map(id => new ObjectId(id)) } })
      .toArray();

  return {
    process,
    steps,
    tasks: allTasks,
    parameters,
    rulesByType: Object.fromEntries(
      Object.entries(rulesByType).map(([k, m]) => [k, [...m.values()]])
    )
  };
}
