// import * as vscode from 'vscode';
import * as Parser from 'web-tree-sitter';
import {
    SemanticTokensBuilder,
    SemanticTokensLegend,
    SemanticTokens,
    Range,
} from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Grammar } from './grammar';

// const parserPromise = Parser.init();

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

    constructor(parser: Parser, grammar: Grammar) {
        const availableTerms: string[] = [
            "type", "scope", "function", "variable", "number", "string", "comment",
            "constant", "directive", "keyword", "operator", "modifier", "punctuation",
        ];
        availableTerms.forEach(term => {
            this.supportedTerms.push(term);
        });

        this.debugDepth = 1;
        this.grammar = grammar;
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
