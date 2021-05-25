import * as Parser from 'web-tree-sitter';
import * as jsonc from 'jsonc-parser';
import * as fs from 'fs';
import { Range } from 'vscode-languageserver';

export class Grammar {
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