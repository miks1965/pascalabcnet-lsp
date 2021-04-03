// import * as vscode from 'vscode';
import * as Parser from 'web-tree-sitter';
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

const parserPromise = Parser.init();
class Grammar {
    parser: Parser;

    readonly simpleTerms: { [sym: string]: string } = {};
    readonly complexTerms: string[] = [];
    readonly complexScopes: { [sym: string]: string } = {};
    readonly complexDepth: number = 0;
    readonly complexOrder: boolean = false;

    constructor(parser: Parser) {
        this.parser = parser;
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
        let langFile = path.join(__dirname, "../tree-sitter-pascalabcnet.wasm");
        const langObj = await Parser.Language.load(langFile);
        this.parser.setLanguage(langObj);
    }

    // Build syntax tree
    tree(doc: string) {
        return this.parser.parse(doc);
    }

    parse(tree: Parser.Tree) {
        let terms: { term: string; range: Range, length: number }[] = [];
        let stack: Parser.SyntaxNode[] = [];
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

export class SemanticTokensProvider {
    readonly grammar: Grammar;
    readonly trees: { [doc: string]: Parser.Tree } = {};
    readonly supportedTerms: string[] = [];
    readonly debugDepth: number;
    readonly legend: SemanticTokensLegend;

    tokenBuilders: Map<string, SemanticTokensBuilder> = new Map();

    constructor(parser: Parser) {
        const availableTerms: string[] = [
            "type", "scope", "function", "variable", "number", "string", "comment",
            "constant", "directive", "keyword", "operator", "modifier", "punctuation",
        ];
        availableTerms.forEach(term => {
            this.supportedTerms.push(term);
        });

        this.debugDepth = 1;
        this.grammar = new Grammar(parser);
        this.legend = new Legend();
    }

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
        const tree = this.grammar.tree(doc.getText());
        const terms = this.grammar.parse(tree);
        this.trees[doc.uri.toString()] = tree;
        // Build tokens
        const builder = new SemanticTokensBuilder();
        console.log("providing tokens, terms count: " + terms.length)
        terms.forEach((t) => {
            if (!this.supportedTerms.includes(t.term))
                return;

            const type = this.legend.tokenTypes.indexOf(t.term);
            const modifiers = -1;

            if (t.range.start.line === t.range.end.line)
                return builder.push(t.range.start.line, t.range.start.character, t.length, type, modifiers);

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
}

function lineAt(doc: TextDocument, line: number) {
    return doc.getText(Range.create(line, 0, line + 1, 0));
}
