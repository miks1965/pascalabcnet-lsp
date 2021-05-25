import { CompletionItem, CompletionItemKind } from "vscode-languageserver/node"

const keywords = ["or", "xor", "and", "div", "mod", "shl", "shr", "not", "as", "in", "is", "implicit", "explicit", "sizeof", "typeof", "where", "array", "begin",
    "case", "class", "const", "constructor", "default", "destructor", "downto", "do", "else", "end", "event", "except", "exports", "file", "finalization", "finally", "for",
    "foreach", "function", "goto", "if", "implementation", "inherited", "initialization", "interface", "label", "lock", "loop", "nil", "procedure", "of", "operator",
    "property", "raise", "record", "repeat", "set", "try", "type", "then", "to", "until", "uses", "var", "while", "with", "program", "template", "packed", "resourcestring",
    "threadvar", "sealed", "partial", "params", "unit", "library", "external", "name", "private", "protected", "public", "internal", "read", "write", "on", "forward",
    "abstract", "overload", "reintroduce", "override", "virtual", "extensionmethod", "new", "auto", "sequence", "yield", "match", "when", "namespace", "static",
]

export function keywordCompletionItems() {
    const items: CompletionItem[] = []
    for (let i = 0; i < keywords.length; i++)
        items.push(
            {
                label: keywords[i],
                kind: CompletionItemKind.Keyword,
                data: i
            })
    return items;
}
