import translate from "translate";
import { I18NMap } from "./html-transform";
import fse from "fs-extra";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
const { readJSONSync, writeJsonSync } = fse;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const cacheFilePath = join(__dirname, "./translate.cache.json");

const groupLen = 100;

export const translateCache = readJSONSync(cacheFilePath) as I18NMap;

function upcaseFirstChar(params: string) {
    return params.slice(0, 1).toUpperCase() + params.slice(1)
}


export async function doTranslate(maps: I18NMap) {
    const opText = filterTranslateText(maps);
    const tip = 'Current length of auto translate: ' + opText.length + (opText.length > 0 ? '⚠️ Please run script again to update files ⚠️' : '');
    const textGroup: string[][] = [];
    let groupItemTemp: string[] = [];
    while (opText.length > 0) {
        const elem = opText.shift();
        if (elem) {
            groupItemTemp.push(elem);
        }
        if (groupItemTemp.length === groupLen || opText.length === 0) {
            textGroup.push(groupItemTemp);
            groupItemTemp = [];
        }
    }
    let index = 0;
    const resultGroup: I18NMap = {};
    while (index < textGroup.length) {
        console.log('translate', index + 1, 'of', textGroup.length);
        await Promise.all(textGroup[index].map(async el => {
            try {
                const value = await translate(el, {
                    from: 'zh',
                    to: 'en'
                });
                resultGroup[el] = upcaseFirstChar(value);
            } catch (error) {
                console.error(`Translate [${el}] API  error :`, error);
            }
        }));
        console.info('Group translate success');
        index++;
    }
    console.info('All translate success');
    console.info(tip);
    const saveCache: I18NMap = {
        ...translateCache,
        ...resultGroup
    }
    writeJsonSync(cacheFilePath, saveCache, {
        EOL: '\n',
        spaces: 2
    })
    return saveCache;
}

export function filterTranslateText(maps: I18NMap) {
    const translatedKeys = Object.keys(translateCache);
    const sholdTranslateKeys: string[] = [];
    for (const key in maps) {
        if (Object.prototype.hasOwnProperty.call(maps, key) && !translatedKeys.includes(key)) {
            sholdTranslateKeys.push(key)
        }
    }
    return sholdTranslateKeys;
}
