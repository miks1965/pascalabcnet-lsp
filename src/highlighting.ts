// import * as vscode from 'vscode';
import * as parser from 'web-tree-sitter';
import * as jsonc from 'jsonc-parser';
import * as fs from 'fs';
import * as path from 'path';
import {
    SemanticTokensBuilder,
    SemanticTokensLegend,
    SemanticTokensClientCapabilities,
    SemanticTokens,
    Range
} from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';

const parserPromise = parser.init();
class Grammar {
    // Parser
    parser: parser = new parser();
    // Grammar
    readonly simpleTerms: { [sym: string]: string } = {};
    readonly complexTerms: string[] = [];
    readonly complexScopes: { [sym: string]: string } = {};
    readonly complexDepth: number = 0;
    readonly complexOrder: boolean = false;

    constructor() {
        // Parse grammar file
        const grammarFile = __dirname + "/../grammars/pascalabcnet.json";
        const grammarJson = jsonc.parse(fs.readFileSync(grammarFile).toString());

        for (const t in grammarJson.simpleTerms)
            this.simpleTerms[t] = grammarJson.simpleTerms[t];
        for (let i = 0; i < grammarJson.complexTerms; i++)
            // for (const t in grammarJson.complexTerms)
            this.complexTerms[i] = grammarJson.complexTerms[i];
        for (const t in grammarJson.complexScopes)
            this.complexScopes[t] = grammarJson.complexScopes[t];
        for (const s in this.complexScopes) {
            const depth = s.split(">").length;
            if (depth > this.complexDepth)
                this.complexDepth = depth;
            if (s.indexOf("[") >= 0)
                this.complexOrder = true;
        }
        this.complexDepth--;
    }

    // Parser initialization
    async init() {
        // Load wasm parser
        await parserPromise;
        // this.parser = new parser();
        let langFile = path.join(__dirname, "../pascalabcnet.wasm");
        console.log("инициализировали парсер");
        const langObj = await parser.Language.load(langFile);
        this.parser.setLanguage(langObj);
    }

    // Build syntax tree
    tree(doc: string) {
        return this.parser.parse(doc);
    }

    // Parse syntax tree
    parse(tree: parser.Tree) {
        // Travel tree and peek terms
        let terms: { term: string; range: Range }[] = [];
        let stack: parser.SyntaxNode[] = [];
        let node = tree.rootNode.firstChild;
        while (stack.length > 0 || node) {
            // Go deeper
            if (node) {
                stack.push(node);
                node = node.firstChild;
            }
            // Go back
            else {
                node = stack.pop()!;
                let type = node.type;
                if (!node.isNamed)
                    type = '"' + type + '"';

                // Simple one-level terms
                let term: string | undefined = undefined;
                if (!this.complexTerms.includes(type)) {
                    term = this.simpleTerms[type];
                }
                // Complex terms require multi-level analyzes
                else {
                    // Build complex scopes
                    let desc = type;
                    let scopes = [desc];
                    let parent = node.parent;
                    for (let i = 0; i < this.complexDepth && parent; i++) {
                        let parentType = parent.type;
                        if (!parent.isNamed)
                            parentType = '"' + parentType + '"';
                        desc = parentType + " > " + desc;
                        scopes.push(desc);
                        parent = parent.parent;
                    }
                    // If there is also order complexity
                    if (this.complexOrder) {
                        let index = 0;
                        let sibling = node.previousSibling;
                        while (sibling) {
                            if (sibling.type === node.type)
                                index++;
                            sibling = sibling.previousSibling;
                        }

                        let rindex = -1;
                        sibling = node.nextSibling;
                        while (sibling) {
                            if (sibling.type === node.type)
                                rindex--;
                            sibling = sibling.nextSibling;
                        }

                        let orderScopes: string[] = [];
                        for (let i = 0; i < scopes.length; i++)
                            orderScopes.push(scopes[i], scopes[i] + "[" + index + "]",
                                scopes[i] + "[" + rindex + "]");
                        scopes = orderScopes;
                    }
                    // Use most complex scope
                    for (const d of scopes)
                        if (d in this.complexScopes)
                            term = this.complexScopes[d];
                }

                // If term is found add it
                if (term) {
                    terms.push({
                        term: term,
                        range: {
                            start: {
                                line: node.startPosition.row,
                                character: node.startPosition.column
                            },
                            end: {
                                line: node.endPosition.row,
                                character: node.endPosition.column
                            }
                        }
                    });
                }
                // Go right
                node = node.nextSibling
            }
        }
        return terms;
    }
}

// Semantic token legend
class Legend implements SemanticTokensLegend {
    tokenTypes: string[];
    tokenModifiers: string[];

    constructor(types: string[], modifiers: string[]) {
        this.tokenTypes = types;
        this.tokenModifiers = modifiers;
    }
}

const termMap = new Map<string, { type: string, modifiers?: string[] }>();
function buildLegend() {
    // Terms vocabulary
    termMap.set("type", { type: "type" });
    termMap.set("scope", { type: "namespace" });
    termMap.set("function", { type: "function" });
    termMap.set("variable", { type: "variable" });
    termMap.set("number", { type: "number" });
    termMap.set("string", { type: "string" });
    termMap.set("comment", { type: "comment" });
    termMap.set("constant", { type: "variable", modifiers: ["readonly", "defaultLibrary"] });
    termMap.set("directive", { type: "macro" });
    termMap.set("control", { type: "keyword" });
    termMap.set("operator", { type: "operator" });
    termMap.set("modifier", { type: "type", modifiers: ["modification"] });
    termMap.set("punctuation", { type: "punctuation" });
    // Tokens and modifiers in use
    let tokens: string[] = [];
    let modifiers: string[] = [];
    termMap.forEach(t => {
        if (!tokens.includes(t.type))
            tokens.push(t.type);
        t.modifiers?.forEach(m => {
            if (!modifiers.includes(m))
                modifiers.push(m);
        });
    });
    // Construct semantic token legend
    return new Legend(tokens, modifiers);
}
const legend = buildLegend();


// export class TokensProvider implements vscode.DocumentSemanticTokensProvider, vscode.HoverProvider {
export class TokensProvider implements vscode.DocumentSemanticTokensProvider, vscode.HoverProvider {
    // readonly grammars: { [lang: string]: Grammar } = {};
    readonly grammar: Grammar;
    readonly trees: { [doc: string]: parser.Tree } = {};
    readonly supportedTerms: string[] = [];
    readonly debugDepth: number;

    constructor() {
        // Terms
        const availableTerms: string[] = [
            "type", "scope", "function", "variable", "number", "string", "comment",
            "constant", "directive", "control", "operator", "modifier", "punctuation",
        ];
        const enabledTerms: string[] = vscode.workspace.
            getConfiguration("syntax").get("highlightTerms");
        availableTerms.forEach(term => {
            if (enabledTerms.includes(term))
                this.supportedTerms.push(term);
        });
        if (!vscode.workspace.getConfiguration("syntax").get("highlightComment"))
            if (this.supportedTerms.includes("comment"))
                this.supportedTerms.splice(this.supportedTerms.indexOf("comment"), 1);
        this.debugDepth = vscode.workspace.getConfiguration("syntax").get("debugDepth");

        this.grammar = new Grammar();
        this.grammar.init()
    }

    // Provide document tokens
    async provideDocumentSemanticTokens(doc: vscode.TextDocument, token: vscode.CancellationToken): Promise<SemanticTokens> {
        // Grammar
        // const lang = doc.languageId;
        // if (!(lang == "pascalabcnet")) {
        // this.grammars[lang] = new Grammar();
        // await this.grammars[lang].init();
        // }
        // Parse document
        // const grammar = this.grammars[lang];
        const tree = this.grammar.tree(doc.getText());
        const terms = this.grammar.parse(tree);
        this.trees[doc.uri.toString()] = tree;
        // Build tokens
        const builder = new vscode.SemanticTokensBuilder(legend);
        terms.forEach((t) => {
            if (!this.supportedTerms.includes(t.term))
                return;
            const type = termMap.get(t.term).type;
            const modifiers = termMap.get(t.term).modifiers;
            if (t.range.start.line === t.range.end.line)
                return builder.push(t.range, type, modifiers);
            let line = t.range.start.line;
            builder.push(new vscode.Range(t.range.start,
                doc.lineAt(line).range.end), type, modifiers);
            for (line = line + 1; line < t.range.end.line; line++)
                builder.push(doc.lineAt(line).range, type, modifiers);
            builder.push(new vscode.Range(doc.lineAt(line).range.start,
                t.range.end), type, modifiers);
        });
        return builder.build();
    }

    // Provide hover tooltips
    async provideHover(
        doc: vscode.TextDocument,
        pos: vscode.Position,
        token: vscode.CancellationToken): Promise<vscode.Hover> {
        const uri = doc.uri.toString();
        if (!(uri in this.trees))
            return null;
        const grammar = this.grammars[doc.languageId];
        const tree = this.trees[uri];

        const xy: parser.Point = { row: pos.line, column: pos.character };
        let node = tree.rootNode.descendantForPosition(xy);
        if (!node)
            return null;

        let type = node.type;
        if (!node.isNamed)
            type = '"' + type + '"';
        let parent = node.parent;

        const depth = Math.max(grammar.complexDepth, this.debugDepth);
        for (let i = 0; i < depth && parent; i++) {
            let parentType = parent.type;
            if (!parent.isNamed)
                parentType = '"' + parentType + '"';
            type = parentType + " > " + type;
            parent = parent.parent;
        }

        // If there is also order complexity
        if (grammar.complexOrder) {
            let index = 0;
            let sibling = node.previousSibling;
            while (sibling) {
                if (sibling.type === node.type)
                    index++;
                sibling = sibling.previousSibling;
            }

            let rindex = -1;
            sibling = node.nextSibling;
            while (sibling) {
                if (sibling.type === node.type)
                    rindex--;
                sibling = sibling.nextSibling;
            }

            type = type + "[" + index + "]" + "[" + rindex + "]";
        }

        return {
            contents: [type],
            range: {
                start: {
                    line: node.startPosition.row,
                    character: node.startPosition.column
                },
                end: {
                    line: node.endPosition.row,
                    character: node.endPosition.column
                }
            }
        }
    };
}
