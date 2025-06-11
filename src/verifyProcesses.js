import fs from "fs";
import path from "path";

export async function verifyExportedProcesses(baseDir = "src-mdr-components/commons") {
    const processNameMap = new Map();

    function getProcessDirectories(areaPath) {
        const processesRoot = path.join(areaPath, "processes");
        if (!fs.existsSync(processesRoot)) return [];

        return fs.readdirSync(processesRoot, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => dirent.name);
    }

    const areas = fs.readdirSync(baseDir, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);

    let total = 0;

    console.log("Validando processos exportados...");
    for (const area of areas) {
        const areaPath = path.join(baseDir, area);
        const processes = getProcessDirectories(areaPath);

        total += processes.length;

        console.log(`Área "${area}": ${processes.length} processo(s)`);

        for (const proc of processes) {
            const fullPath = `${area}/processes/${proc}`;
            if (processNameMap.has(proc)) {
                processNameMap.get(proc).push(fullPath);
            } else {
                processNameMap.set(proc, [fullPath]);
            }
        }
    }

    console.log(`\nTotal de processos encontrados: ${total}`);

    const duplicated = [...processNameMap.entries()].filter(([_, paths]) => paths.length > 1);

    if (duplicated.length > 0) {
        console.warn("\nProcessos com nomes duplicados encontrados:");
        for (const [name, locations] of duplicated) {
            console.warn(`- "${name}" encontrado em:`);
            locations.forEach(loc => console.warn(`   • ${loc}`));
        }
    } else {
        console.log("Nenhum processo duplicado encontrado.");
    }
}
