import { readdirSync, statSync } from "fs";
import fse from "fs-extra";
// import copyfiles from "copyfiles";
import { join, extname, dirname } from "path";
import { fileURLToPath } from "url";
import { I18NMap } from "./html-transform";
import { doTranslate } from "./autoTranslate";
import { transformLocaleJs } from "./scirpt-transform";

const { emptyDirSync, outputFileSync, writeJsonSync } = fse;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const targetScriptDirs = [
    'constant',
    'controllers',
    'directives',
    'filters',
    'services',
]

const sourceDir = join(__dirname, "../app");
const outputDir = join(__dirname, "../.i18n_temp");
const _scriptsDir = targetScriptDirs.map(p => join(outputDir, "./scripts", p));
const scriptsDir = [..._scriptsDir, join(outputDir, "./images")];
const htmlDir = [join(outputDir, "./views"), join(outputDir, 'index.html')];


type FILE_TYPE = "script" | "html";
type FILE_EXT = ".js" | ".ts" | ".html"

const FILE_TYPE_MAP: Record<FILE_EXT, FILE_TYPE> = {
    ".js": "script",
    ".ts": "script",
    ".html": "html",
};

export function getFilesPath(type: FILE_TYPE, curPath?: string, arr: string[] = []) {
    const filesPath = arr || [];
    const _targetPath = curPath || (type === "script" ? scriptsDir : htmlDir);
    const targetPathes = Array.isArray(_targetPath) ? _targetPath : [_targetPath]
    targetPathes.forEach(targetPath => {
        const stat = statSync(targetPath);
        if (stat.isFile()) {
            filesPath.push(targetPath);
        } else {
            readdirSync(targetPath).forEach((item) => {
                const fullPath = join(targetPath, item);
                const stat = statSync(fullPath);
                if (stat.isFile()) {
                    const extName = extname(fullPath);
                    if (FILE_TYPE_MAP[extName] === type) {
                        filesPath.push(fullPath);
                    }
                } else if (stat.isDirectory()) {
                    getFilesPath(type, fullPath, filesPath);
                }
            });
        }
    })
    return filesPath;
}

function replaceLocaleJs(localeJs) {
    const newLocaleJs = localeJs.replace(/:"/g, '："');
    return newLocaleJs;
}
async function replaceLocaleFile(mapInEnValue: I18NMap) {
    const en_US = mapInEnValue;
    const zh_CN = {};
    for (const key in mapInEnValue) {
        if (Object.prototype.hasOwnProperty.call(mapInEnValue, key)) {
            zh_CN[key] = key;
        }
    }
    const path = join(outputDir, 'scripts', 'vendors', 'angular-translate', 'locale.js')
    let result = transformLocaleJs(readFileToString(path).toString(), {
        en_US,
        zh_CN
    })
    //将 result 中的 :" 替换为 ："
   const res = replaceLocaleJs(result);
    // const format = await prettier.format(result, { semi: true, parser: "babel", printWidth: 300, quoteProps: "consistent" });
    outputFileSync(path, res || '')
}

export async function writeFiles(fileObj: Array<{
    output: string;
    i18n: I18NMap;
    path: string;
}>) {
    let i18nMap = {};
    fileObj.forEach(option => {
        const {
            output,
            i18n,
            path
        } = option;
        i18nMap = {
            ...i18n,
            ...i18nMap
        }
        // const [fileName, ...rest] = path.split(sep).reverse();
        const dir = path.replace(sourceDir, outputDir);
        outputFileSync(dir, output);
    });
    const result = await doTranslate(i18nMap);
    await replaceLocaleFile(result);
    console.info("Done", fileObj.length, "files processed, and", Object.keys(result).length, "sentences translated")
}

export function copyAppDir() {
    emptyDirSync(outputDir);
    fse.copySync(sourceDir, outputDir);
}

export function readFileToString(path: string) {
    return fse.readFileSync(path).toString();
}
