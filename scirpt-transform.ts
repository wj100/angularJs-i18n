import { transformSync } from "@babel/core";
import t from "@babel/types";
import { getFilesPath, readFileToString } from "./fileHandler";
import { I18NMap, transformHtml } from "./html-transform";
import { containCnChar, isClosedTagHtmlLikeText } from "./util";
import { translateCache } from "./autoTranslate";
import { basename, extname } from "path";

export const transformLocaleJs = (code: string, localeObj: { en_US: I18NMap, zh_CN: I18NMap }) => {
    const result = transformSync(code, {
        generatorOpts: {
            jsescOption: {
                minimal: true
            }
        },
        plugins: [
            {
                visitor: {
                    ObjectProperty: (path) => {
                        for (const key in localeObj) {
                            if (Object.prototype.hasOwnProperty.call(localeObj, key)) {
                                const value: Object = localeObj[key];
                                if (t.isIdentifier(path.node.key) && path.node.key.name === key) {
                                    path.node.value = t.objectExpression(
                                        Object.keys(value).map((k) => {
                                            return {
                                                type: 'ObjectProperty',
                                                key: t.stringLiteral(k),
                                                value: t.stringLiteral(value[k]),
                                                computed: false,
                                                shorthand: false
                                            }
                                        })
                                    )
                                }
                            }
                        }

                    },
                },
            },
        ]
    })
    return result?.code
}
const translateNode = (node) => {
    const key = node.value;
    return t.callExpression(
        {
            type: 'MemberExpression',
            object: {
                type: 'Identifier',
                name: 'window'
            },
            property: {
                type: 'Identifier',
                name: '$tsi'
            },
            computed: false
        },
        [t.stringLiteral(key)]
    )
}
const jssTransForm = (code: string, fileName: string) => {
    const i18n: I18NMap = {};
    const result = transformSync(code, {
        generatorOpts: {
            jsescOption: {
                minimal: true
            }
        },
        plugins: [
            {
                visitor: {
                    ObjectProperty: (path) => {
                        // 处理字面量对象属性值中的中文字符
                        // isClosedTagHtmlLikeText
                        if (
                            t.isStringLiteral(path.node.value) &&
                            containCnChar(path.node.value.value) &&
                            // 排除用'type' 'key'等作为属性名称
                            !(
                                t.isIdentifier(path.node.key) &&
                                ['type', 'key'].includes(path.node.key.name)
                            )
                        ) {
                            const key = path.node.value.value;
                            if (isClosedTagHtmlLikeText(key)) {
                                //js,ts文件中，处理html标签中的中文字符
                                if((fileName&&fileName.includes('js'))||(fileName&&fileName.includes('ts'))){
                                    // console.log(fileName, key);
                                    // console.log(`isClosedTagHtmlLikeText :`, key);
                                    return
                                }
                                // console.log(`isClosedTagHtmlLikeText :`,fileName, key);
                                const { i18n: htmlI18N, html: transformedHtml } = transformHtml(key);
                                Object.assign(i18n, htmlI18N);
                                path.replaceWith(t.objectProperty(path.node.key, t.stringLiteral(transformedHtml)))
                                path.skip();
                            } else {
                                i18n[key] = key;
                                if (translateCache && translateCache[key]) {
                                    path.replaceWith(t.objectProperty(path.node.key, t.callExpression(
                                        {
                                            type: 'MemberExpression',
                                            object: {
                                                type: 'Identifier',
                                                name: 'window'
                                            },
                                            property: {
                                                type: 'Identifier',
                                                name: '$tsi'
                                            },
                                            computed: false
                                        },
                                        [t.stringLiteral(key)]
                                    )))
                                }
                            }
                        }
                    },
                    CallExpression: (path) => {
                        // 处理函数调用表达式参数中的中文字符
                        if (
                            path.node.callee.type === 'MemberExpression' &&
                            path.node.callee.property.type === 'Identifier' &&
                            ['$tsi', 'html', 'text'].includes(path.node.callee.property.name)
                        ) {
                            return void 0
                        }
                        path.node.arguments = path.node.arguments.map(argNode => {
                            if (
                                t.isStringLiteral(argNode)
                                && containCnChar(argNode.value)
                            ) {
                                let key = argNode.value;
                                if (isClosedTagHtmlLikeText(key)) {
                                    const { i18n: htmlI18N, html: transformedHtml } = transformHtml(key);
                                    Object.assign(i18n, htmlI18N);
                                    key = transformedHtml;
                                } else {
                                    i18n[key] = key;
                                }
                                if (translateCache && translateCache[key]) {
                                    return t.callExpression(
                                        {
                                            type: 'MemberExpression',
                                            object: {
                                                type: 'Identifier',
                                                name: 'window'
                                            },
                                            property: {
                                                type: 'Identifier',
                                                name: '$tsi'
                                            },
                                            computed: false
                                        },
                                        [t.stringLiteral(key)]
                                    )
                                }

                            }
                            return argNode
                        })
                    },
                    ConditionalExpression(path) {
                        const { test, consequent, alternate } = path.node;
                        if (t.isStringLiteral(consequent) && containCnChar(consequent.value)) {
                          i18n[consequent.value] = consequent.value;
                          const transformedConsequent = translateNode(consequent);
                          path.node.consequent = transformedConsequent
                        }
                        if (t.isStringLiteral(alternate) && containCnChar(alternate.value)) {
                          i18n[alternate.value] = alternate.value;
                          const transformedAlternate = translateNode(alternate);
                          path.node.alternate = transformedAlternate
                        }
                      }
                },
            },
            "@babel/plugin-syntax-typescript",
            // "@babel/plugin-syntax-export-namespace-from"
        ]
    })
    return {
        i18n,
        output: result && result.code ? result.code : code
    }
}

export async function transFormJss() {
    const pathes = getFilesPath("script");
    const result = pathes
        // .filter(path => {
        //     return extname(path) === '.js'
        // })
        .map((path, index, arr) => {
            //console.log("***** js ts *******");
            //console.log(`${index + 1} of ${arr.length}`);
            //console.log(path);
            const source = readFileToString(path);

            const result = jssTransForm(source, basename(path));
            return {
                output: result.output,
                i18n: result.i18n,
                path
            }
        });
    //console.log("************");
    return result;
}

