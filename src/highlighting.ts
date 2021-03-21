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
    Range,
    CancellationToken,
    Position,
    Hover,
    SemanticTokensOptions
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
        console.log("run Grammar()");
        // Parse grammar file
        const grammarFile = __dirname + "/../grammars/pascalabcnet.json";
        const grammarJson = jsonc.parse(fs.readFileSync(grammarFile).toString());

        console.log("read grammar files");

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
        console.log("finish Grammar()");
    }

    // Parser initialization
    async init() {
        // Load wasm parser
        await parserPromise;
        // this.parser = new parser();
        let langFile = path.join(__dirname, "../tree-sitter-pascalabcnet.wasm");
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
        let terms: { term: string; range: Range, length: number }[] = [];
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
                        },
                        length: node.text.length
                    });
                }
                // Go right
                node = node.nextSibling
            }
        }
        return terms;
    }
}

const termMap = new Map<string, { type: string, modifiers?: string[] }>([
    ["type", { type: "type" }],
    ["scope", { type: "namespace" }],
    ["function", { type: "function" }],
    ["variable", { type: "variable" }],
    ["number", { type: "number" }],
    ["string", { type: "string" }],
    ["comment", { type: "comment" }],
    ["constant", { type: "variable", modifiers: ["readonly", "defaultLibrary"] }],
    ["directive", { type: "macro" }],
    ["control", { type: "keyword" }],
    ["operator", { type: "operator" }],
    ["modifier", { type: "type", modifiers: ["modification"] }],
    ["punctuation", { type: "punctuation" }]
]);

class Legend implements SemanticTokensLegend {
    tokenTypes: string[];
    tokenModifiers: string[];

    constructor() {
        this.tokenTypes = [];
        this.tokenModifiers = [];

        termMap.forEach(t => {
            if (!this.tokenTypes.includes(t.type))
                this.tokenTypes.push(t.type);
            t.modifiers?.forEach(m => {
                if (!this.tokenModifiers.includes(m))
                    this.tokenModifiers.push(m);
            });
        });
    }
}
// export const legend = new Legend();

// export class sTokensProvider implements SemanticTokensOptions {
//     legend: SemanticTokensLegend;
//     range?: boolean | {} | undefined;
//     full?: boolean | { delta?: boolean | undefined; } | undefined;
//     workDoneProgress?: boolean | undefined;

//     constructor() {
//         this.legend = legend;
//     }
// }

export class Provider {
    // readonly grammar: Grammar;
    readonly trees: { [doc: string]: parser.Tree } = {};
    readonly supportedTerms: string[] = [];
    readonly debugDepth: number;
    readonly legend: SemanticTokensLegend;

    tokenBuilders: Map<string, SemanticTokensBuilder> = new Map();

    constructor() {
        const availableTerms: string[] = [
            "type", "scope", "function", "variable", "number", "string", "comment",
            "constant", "directive", "control", "operator", "modifier", "punctuation",
        ];
        console.log("вызвали конструктор Provider")
        availableTerms.forEach(term => {
            // if (enabledTerms.includes(term))
            this.supportedTerms.push(term);
        });
        // if (highlightComment)
        // if (this.supportedTerms.includes("comment"))
        // this.supportedTerms.splice(this.supportedTerms.indexOf("comment"), 1);

        // this.debugDepth = debugDepth;
        this.debugDepth = 1;
        console.log("инициализировали debugDepth")

        // this.grammar = new Grammar();
        console.log("не инициализировали Grammar")

        this.legend = new Legend();
        console.log("инициализировали Legend")
    }

    // constructor(enabledTerms: string[], highlightComment: boolean, debugDepth: number) {
    //     const availableTerms: string[] = [
    //         "type", "scope", "function", "variable", "number", "string", "comment",
    //         "constant", "directive", "control", "operator", "modifier", "punctuation",
    //     ];
    //     availableTerms.forEach(term => {
    //         // if (enabledTerms.includes(term))
    //         this.supportedTerms.push(term);
    //     });
    //     // if (highlightComment)
    //     // if (this.supportedTerms.includes("comment"))
    //     // this.supportedTerms.splice(this.supportedTerms.indexOf("comment"), 1);

    //     // this.debugDepth = debugDepth;
    //     this.debugDepth = 1;

    //     this.grammar = new Grammar();
    //     this.grammar.init()

    //     this.legend = new Legend();
    // }

    getTokenBuilder(document: TextDocument): SemanticTokensBuilder {
        let result = this.tokenBuilders.get(document.uri);
        if (result !== undefined) {
            return result;
        }
        result = new SemanticTokensBuilder();
        this.tokenBuilders.set(document.uri, result);
        return result;
    }

    async provideDocumentSemanticTokens(doc: TextDocument): Promise<SemanticTokens> {
        let grammar = new Grammar();
        await grammar.init()
        const tree = grammar.tree(doc.getText());
        const terms = grammar.parse(tree);
        this.trees[doc.uri.toString()] = tree;
        // Build tokens
        const builder = new SemanticTokensBuilder();
        terms.forEach((t) => {
            if (!this.supportedTerms.includes(t.term))
                return;

            const type = this.legend.tokenTypes.indexOf(t.term);
            const modifiers = -1; // придумать как их находить

            if (t.range.start.line === t.range.end.line)
                return builder.push(t.range.start.line, t.range.start.character, lineAt(doc, t.range.start.line).length, type, modifiers);

            let line = t.range.start.line;

            let startCharacter = t.range.start.character;
            let firstLineTermPartLength = startCharacter + lineAt(doc, line).substring(startCharacter).length;

            builder.push(line, startCharacter, firstLineTermPartLength, type, modifiers);

            for (line = line + 1; line < t.range.end.line; line++)
                builder.push(line, 0, lineAt(doc, line).length, type, modifiers);

            builder.push(line, 0, t.range.end.character, type, modifiers);
        });
        return builder.build();
    }

    // async provideHover(doc: TextDocument, pos: Position, token: CancellationToken): Promise<Hover | null> {
    //     const uri = doc.uri.toString();
    //     if (!(uri in this.trees))
    //         return null;
    //     // const grammar = this.grammars[doc.languageId];
    //     const tree = this.trees[uri];

    //     const xy: parser.Point = { row: pos.line, column: pos.character };
    //     let node = tree.rootNode.descendantForPosition(xy);
    //     if (!node)
    //         return null;

    //     let type = node.type;
    //     if (!node.isNamed)
    //         type = '"' + type + '"';
    //     let parent = node.parent;

    //     const depth = Math.max(this.grammar.complexDepth, this.debugDepth);
    //     for (let i = 0; i < depth && parent; i++) {
    //         let parentType = parent.type;
    //         if (!parent.isNamed)
    //             parentType = '"' + parentType + '"';
    //         type = parentType + " > " + type;
    //         parent = parent.parent;
    //     }

    //     // If there is also order complexity
    //     if (this.grammar.complexOrder) {
    //         let index = 0;
    //         let sibling = node.previousSibling;
    //         while (sibling) {
    //             if (sibling.type === node.type)
    //                 index++;
    //             sibling = sibling.previousSibling;
    //         }

    //         let rindex = -1;
    //         sibling = node.nextSibling;
    //         while (sibling) {
    //             if (sibling.type === node.type)
    //                 rindex--;
    //             sibling = sibling.nextSibling;
    //         }

    //         type = type + "[" + index + "]" + "[" + rindex + "]";
    //     }

    //     return {
    //         contents: [type],
    //         range: Range.create(
    //             node.startPosition.row, node.startPosition.column,
    //             node.endPosition.row, node.endPosition.column)
    //     };
    // }
}

function lineAt(doc: TextDocument, line: number) {
    return doc.getText(Range.create(line, -1, line, Number.MAX_VALUE));
}
