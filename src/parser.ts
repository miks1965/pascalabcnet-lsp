import * as fs from 'fs';
import * as Parser from 'web-tree-sitter'

export async function initializeParser(): Promise<Parser> {
    await Parser.init()
    const parser = new Parser()

    let pathToLanguage = `${__dirname}/../node_modules/tree-sitter-pascalabcnet/tree-sitter-pascalabcnet.wasm`
    if (!fs.existsSync(pathToLanguage))
        pathToLanguage = `${__dirname}/../../tree-sitter-pascalabcnet/tree-sitter-pascalabcnet.wasm`

    const lang = await Parser.Language.load(pathToLanguage)

    parser.setLanguage(lang)
    return parser
}
