import { parse, } from "angular-html-parser";
import { getFilesPath, readFileToString } from "./fileHandler";
import { ParseTreeResult } from "angular-html-parser/lib/compiler/src/ml_parser/parser.js";
import { Text, Attribute, CDATA, Comment, DocType, Element, Node } from "angular-html-parser/lib/compiler/src/ml_parser/ast";
import { containCnChar } from "./util.js";
import { translateCache } from "./autoTranslate";
import { basename } from "path";
import {chineseWithEnglishSymbols} from "./specialTxt";

export type I18NMap = Record<string, string>
type GenerateFunc<T = Node, R = string> = (node: T, i18n: I18NMap) => R;

// todo 将不做处理的也提取一份 好后续尝试手工修改



function isEmptyElement(name: string) {
    // https://developer.mozilla.org/zh-CN/docs/Glossary/Void_element
    // <area>
    // <base>
    // <br>
    // <col>
    // <embed>
    // <hr>
    // <img>
    // <input>
    // <link>
    // <meta>
    // <param> 已弃用
    // <source>
    // <track>
    // <wbr>
    return [
        'area',
        'base',
        'br',
        'col',
        'embed',
        'hr',
        'img',
        'input',
        'link',
        'meta',
        'param',
        'source',
        'track',
        'wbr'
    ].includes(name);
}

export function formatChar(text: string) {
    return text.trim().replace(/^\s+|\s+$/g, "");
}
const replaceChineseWithTranslation = (content: any,i18nMap) => {
    let res = ''
    if(!content) {
        res=content
    }
    //如果包含中文
    if (containCnChar(content)) {
        const specialText = chineseWithEnglishSymbols.map(txt => `(${txt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`).join('|');
        // 创建完整的正则表达式
        // const chineseRegex1 = /(["'])([\u4e00-\u9fa5，。？！（）《》“”‘’：；……]+)\1/g;
        const chineseRegex = new RegExp(`(["'])(${specialText}|[\\u4e00-\\u9fa5，。？！（）《》“”‘’：；……]+)\\1`, 'g');
        res = content.replace(chineseRegex, (match, quote, chinese) => {
            i18nMap[chinese] = chinese
            return `('${chinese}' | translate)`
        });
        //console.log("🚀 ~ file: html-transform.ts:60 ~ replaceChineseWithTranslation ~ content:", res)
    }else{
        res=content
    }
    return res
}
const generateTextType: GenerateFunc<Text> = (node, i18nMap) => {
    let result = node.value;
    if (node.tokens) {
        result = '';
        node.tokens.forEach(({
            parts
        }) => {
            const [head, content, tail] = parts;
            if (head === "{{" && tail === "}}") {
                const contentTls= replaceChineseWithTranslation(content,i18nMap)
                result += `{{${contentTls}}}`;
            } else {
                result += parts.map(pt => {
                    const target = formatChar(pt)
                    // 记录中文字符
                    if (containCnChar(target)) {
                        i18nMap[target] = target
                    }
                    // 转换
                    if (translateCache && translateCache[target]) {
                        return `{{ '${target}' | translate }}`
                    }
                    return pt
                }).join("");
            }
        });
    }
    return result;
}


const generateAttrType: GenerateFunc<Attribute> = (node, i18nMap) => {
    let value = "";
    const attrNamesShouldTakeI18n = [
        'placeholder',
        'ng-placeholder',
        'ng-attr-title',
        'tooltip',
        'alt',
        'popover',
    ]
    const valueText = node.value.trim();
    if (node.valueTokens && attrNamesShouldTakeI18n.includes(node.name)) {
        node.valueTokens.forEach(({ parts }) => {
            // value += vt.parts.join("");
            const [head, content, tail] = parts;
            if (head === "{{" && tail === "}}") {
                // 是个表达式，暂时不做处理，直接合并
                // value += parts.join("");
                const contentTls= replaceChineseWithTranslation(content,i18nMap)
                value += `{{${contentTls}}}`;
            } else {
                parts.forEach(pt => {
                    const target = formatChar(pt)
                    if (containCnChar(target)) {
                        i18nMap[target] = target
                    }
                    if (translateCache && translateCache[target]) {
                        value += `{{ '${target}' | translate }}`
                    } else {
                        value += pt
                    }
                })
            }
        })

    }
    //  类似tooltip-html 里面的的html模板 无法被angular解析 里面的text无法直接通过脚本翻译 考虑后续陆续人工替换
    else if (node.name === 'tooltip-html' && valueText.startsWith('\'') && valueText.endsWith('\'')) {
        const { html: _html } = generateHtml(parse(valueText.slice(1, node.value.length - 1)).rootNodes, '', i18nMap);
        value += `'${_html}'`;
    }
    else if (node.value) {
        value += node.value;
    }
    if(node.name==='tag-options'){
        /* 这个属性需要被 JSON.parse解析 json 字符串属性必须是双引号 */
        return `${node.name}${value ? `='${value.replace(/'/g, "'")}'` : ''}`
    }
    if(node.name==='ngf-options'){
        /*含有placeholder的这个属性需要被 JSON.parse解析 json 字符串属性必须是双引号 */
        if(value.includes('placeholder')){
           // console.log("🚀 ~ file: html-transform.ts:156 ~ generateAttrType ~ value", value)
            return `${node.name}${value ? `='${value.replace(/'/g, "'")}'` : ''}`
        }
    }
    if (node.name === 'class') {
        //不需要给以下class属性添加单引号,因为是存在于 tooltip-html 里面的html模板中的
        const classList = ['align_left','text-break']
        if(value==='align_left' || value==='text-break'){
            return `${node.name}=${value}`
        }
    }
    return `${node.name}${value ? `="${value.replace(/"/g, "'")}"` : ''}`
}

const generateElmentType: GenerateFunc<Element> = (node, i18n) => {
    let text = "";
    let attrText = "";

    if (node.attrs) {
        attrText = node.attrs.map(attr => {
            return generateAttrType(attr, i18n)
        }).join(" ");
    }
    text += `<${node.name} ${attrText}>`;
    if (!isEmptyElement(node.name)) {
        // documnet.title不翻译
        if (['title'].includes(node.name) && node.children.length > 0) {
            text += `${(node.children[0] as Text).value}</${node.name}>`;
            return text
        }
        const elmentsNamesChildrenSkipTakeI18n: string[] = ['textarea', 'style'];
        if (node.children.length > 0) {
            if (elmentsNamesChildrenSkipTakeI18n.includes(node.name)) {
                // 无需提取中文
                text += generateHtml(node.children, '',).html;
            } else if (node.name === 'script') {
                // 内联模板
                if (node.attrs.find(e => e.name === "type" && e.value === "text/ng-template")) {
                    const scriptChildAst = parse((node.children[0] as Text).value);
                    text += generateHtml(scriptChildAst.rootNodes, '', i18n).html
                } else {
                    text += generateHtml(node.children, '',).html;
                }
            } else {
                text += generateHtml(node.children, '', i18n).html;
            }
        }
        text += `</${node.name}>`;
    }
    return text;
}

const generateCommentType: GenerateFunc<Comment> = (node) => {
    return "<!-- " + node.value + " -->";
}

function generateHtml(nodes: ParseTreeResult['rootNodes'], text: string = '', i18nMap: I18NMap = {}) {
    let nextText = text.slice();
    nodes.forEach((node) => {
        switch (node.type) {
            case 'text':
                nextText += generateTextType(node, i18nMap);
                break;
            case 'element':
                nextText += generateElmentType(node, i18nMap);
                break;
            case 'attribute':
                nextText += generateAttrType(node, i18nMap);
                break;
            case 'cdata':
                break;
            case 'comment':
                nextText += generateCommentType(node, i18nMap);
                break;
            case 'docType':
                nextText += `<!DOCTYPE html>`;
                break;
            default:
                break;
        }
    });
    return {
        html: nextText,
        i18n: i18nMap,
    };
}

export const transformHtml = (source: string) => {
    return generateHtml(parse(source).rootNodes);
}

export async function parseAngularHtml() {
    const pathes = getFilesPath("html");
    // 跳过某些html 这类html并不加载angular框架 无法直接翻译
    const skipFilesName = [
        'pay.html'
    ]
    const result = pathes
        .filter(path => {
            return !skipFilesName.includes(basename(path));
        })
        .map((path, index, arr) => {
            const { html, i18n } = transformHtml(readFileToString(path));
            ////console.log("************");
            ////console.log(`${index + 1} of ${arr.length}`);
            ////console.log(path);
            return {
                output: html,
                i18n,
                path
            }
        });
    ////console.log("************");
    return result;
}


