import * as Parser from 'web-tree-sitter'

export async function initializeParser(): Promise<Parser> {
    await Parser.init()
    const parser = new Parser()

    const lang = await Parser.Language.load(`${__dirname}/../node_modules/tree-sitter-pascalabcnet/tree-sitter-pascalabcnet.wasm`)

    parser.setLanguage(lang)
    return parser
}
