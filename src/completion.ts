import { TextDocument } from "vscode-languageserver-textdocument"
import { CompletionItem, CompletionItemKind } from "vscode-languageserver/node"
import { completionItems } from "./server"

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

function isLetter(character: string) {
    return character && character.toLowerCase() != character.toUpperCase()
}

function diff(currentText: string, newText: string): [string, string] {
    let startPosition = 0

    do {
        if (currentText[startPosition] == newText[startPosition])
            startPosition++
        else
            break
    } while (startPosition < currentText.length && startPosition < newText.length);

    if (startPosition == currentText.length && startPosition == newText.length)
        return ["", ""]

    while (startPosition > 0 && isLetter(newText[startPosition - 1]))
        startPosition--

    let prevEndPosition = currentText.length - 1
    let newEndPosition = newText.length - 1

    do {
        if (currentText[prevEndPosition] == newText[newEndPosition]) {
            prevEndPosition--
            newEndPosition--
        }
        else
            break
    } while (prevEndPosition >= 0 && newEndPosition >= 0);

    while (prevEndPosition < currentText.length - 1 && isLetter(currentText[prevEndPosition + 1]))
        prevEndPosition++
    while (newEndPosition < newText.length - 1 && isLetter(newText[newEndPosition + 1]))
        newEndPosition++

    prevEndPosition = prevEndPosition > startPosition ? prevEndPosition : startPosition
    newEndPosition = newEndPosition > startPosition ? newEndPosition : startPosition

    let removedText = currentText.substring(startPosition, prevEndPosition + 1)
    let addedText = newText.substring(startPosition, newEndPosition + 1)

    if (containsOnlyLetters(addedText))
        addedText = ""

    return [removedText, addedText]
}

function containsOnlyLetters(text: string) {
    for (let i = 0; i < text.length; i++)
        if (!isLetter(text[i]))
            return false

    return true
}

function extractWords(text: string): string[] {
    const result: string[] = []
    let word = ""
    let position = 0

    while (position < text.length - 1) {
        const symbol = text[position]
        if (isLetter(symbol))
            word += symbol
        else if (word.length > 0) {
            result.push(word)
            word = ""
        }
        position++
    }

    if (word.length > 0 && !keywords.includes(word))
        result.push(word)

    return result
}

function removeCompletionElements(removedWords: string[]) {
    removedWords.forEach(word => {
        const index = completionElementIndex(word)
        if (index != -1) completionItems.splice(index, 1)
    })
}

function addCompletionElements(addedWords: string[]) {
    addedWords.forEach(word => {
        const index = completionElementIndex(word)
        if (index == -1) {
            completionItems.push(
                {
                    label: word,
                    kind: CompletionItemKind.Text,
                    data: completionItems.length
                })
        }
    })
}

function unique(removedWords: string[], addedWords: string[]): [string[], string[]] {
    const newRemoved: string[] = []
    const newAdded: string[] = []

    removedWords.forEach(word => {
        if (!addedWords.includes(word) && !keywords.includes(word) && !newRemoved.includes(word))
            newRemoved.push(word)
    })

    addedWords.forEach(word => {
        if (!removedWords.includes(word) && !keywords.includes(word) && !newAdded.includes(word))
            newAdded.push(word)
    })

    return [newRemoved, newAdded]
}

export async function updateCompletion(currentText: string, textDocument: TextDocument) {
    const [removedText, addedText] = diff(currentText, textDocument.getText())
    const [removedWords, addedWords] = unique(extractWords(removedText), extractWords(addedText))

    console.log("remove: ")
    removedWords.forEach(word => console.log(word + ", "))

    console.log("add: ")
    addedWords.forEach(word => console.log(word + ", "))

    removeCompletionElements(removedWords)
    addCompletionElements(addedWords)
}

function completionElementIndex(element: string): number {
    for (let i = 0; i < completionItems.length; i++)
        if (completionItems[i].label == element)
            return i

    return -1
}
