import { copyAppDir, writeFiles } from "./fileHandler";
import { parseAngularHtml } from "./html-transform";
import './fetch-polyfill'
import { transFormJss } from "./scirpt-transform";

async function main() {
    copyAppDir();
    const htmlRes = await parseAngularHtml();
    const scriptRes = await transFormJss();
    await writeFiles([...htmlRes, ...scriptRes]);
    // await writeFiles([...scriptRes]);
    process.exit(0);
}
main();
