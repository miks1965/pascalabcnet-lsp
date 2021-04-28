import * as Parser from 'web-tree-sitter';
import * as jsonc from 'jsonc-parser';
import * as fs from 'fs';
import {
    Range,
} from 'vscode-languageserver';

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

    format(tree: Parser.Tree) {
        let stack: { node: Parser.SyntaxNode, nestingLevel: number }[] = []
        let node = tree.rootNode.firstChild
        const spacesOnLevel = 4

        if (node)
            stack.push({ node: node, nestingLevel: 0 })

        while (stack.length > 0) {
            let value = stack.pop()
            let currentNode = value?.node
            let nestingLevel = value?.nestingLevel

            let nextSibling = currentNode?.nextSibling
            if (nextSibling && nestingLevel != null)
                stack.push({ node: nextSibling, nestingLevel: nestingLevel })

            if (currentNode && nestingLevel != null) {
                let newNestingLevel = nestingLevel
                if (currentNode.type == "compound_stmt") {
                    newNestingLevel++
                    this.shiftChildren(currentNode, newNestingLevel, spacesOnLevel)
                }
                let child = currentNode.firstChild
                while (child) {
                    stack.push({ node: child, nestingLevel: newNestingLevel })
                    child = child.nextSibling
                }
            }
        }

        return tree
    }

    shiftChildren(node: Parser.SyntaxNode, nestingLevel: number, spacesOnLevel: number) {
        let shift = nestingLevel * spacesOnLevel
        let child = node.firstChild

        while (child) {
            if (shift != 0 && child.type != "tkBegin" && child.type != "tkEnd") {
                console.log("shifting " + child.type)

                console.log("old end = " + child.endPosition.column)
                child.endPosition.column += shift - child.startPosition.column
                console.log("new end = " + child.endPosition.column)

                console.log("old start = " + child.startPosition.column)
                child.startPosition.column = shift
                console.log("new start = " + child.startPosition.column)

            }
            console.log(child)
            child = child.nextSibling
        }
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