import {
    createConnection,
    TextDocuments,
    Diagnostic,
    DiagnosticSeverity,
    ProposedFeatures,
    InitializeParams,
    DidChangeConfigurationNotification,
    CompletionItem,
    CompletionItemKind,
    TextDocumentPositionParams,
    TextDocumentSyncKind,
    InitializeResult,
    SemanticTokensRegistrationOptions,
    SemanticTokensRegistrationType,
    DocumentFormattingParams,
} from 'vscode-languageserver/node';

import {
    TextDocument, TextEdit
} from 'vscode-languageserver-textdocument';

import * as Parser from 'web-tree-sitter';

import { SemanticTokensProvider } from './highlighting';
import { initializeParser } from './parser';
import { Grammar } from './grammar';
import { format } from './formatting';
import { keywordCompletionItems } from './completion'

let connection = createConnection(ProposedFeatures.all);
let documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);
let completionItems: CompletionItem[] = []

let hasConfigurationCapability: boolean = true;
let hasWorkspaceFolderCapability: boolean = false;
let hasDiagnosticRelatedInformationCapability: boolean = false;

let parser: Parser;
let semanticTokensProvider: SemanticTokensProvider;
let grammar: Grammar;

connection.onInitialize(async (params: InitializeParams) => {
    let capabilities = params.capabilities;

    hasConfigurationCapability = !!(
        capabilities.workspace && !!capabilities.workspace.configuration
    );
    hasWorkspaceFolderCapability = !!(
        capabilities.workspace && !!capabilities.workspace.workspaceFolders
    );
    hasDiagnosticRelatedInformationCapability = !!(
        capabilities.textDocument &&
        capabilities.textDocument.publishDiagnostics &&
        capabilities.textDocument.publishDiagnostics.relatedInformation
    );

    const result: InitializeResult = {
        capabilities: {
            textDocumentSync: TextDocumentSyncKind.Incremental,
            documentFormattingProvider: true,
            completionProvider: {
                resolveProvider: true
            }
        }
    };
    if (hasWorkspaceFolderCapability) {
        result.capabilities.workspace = {
            workspaceFolders: {
                supported: true
            }
        };
    }

    parser = await initializeParser();
    grammar = new Grammar(parser);
    semanticTokensProvider = new SemanticTokensProvider(parser, grammar);

    completionItems = keywordCompletionItems();

    return result;
});

connection.onInitialized(() => {
    if (hasConfigurationCapability) {
        connection.client.register(DidChangeConfigurationNotification.type, undefined);
    }
    if (hasWorkspaceFolderCapability) {
        connection.workspace.onDidChangeWorkspaceFolders(_event => {
            connection.console.log('Workspace folder change event received.');
        });
    }
    const registrationOptions: SemanticTokensRegistrationOptions = {
        documentSelector: null,
        legend: semanticTokensProvider.legend,
        range: false,
        full: {
            delta: false
        }
    };
    connection.client.register(SemanticTokensRegistrationType.type, registrationOptions);
});

connection.languages.semanticTokens.on((params) => {
    const document = documents.get(params.textDocument.uri);
    if (document == undefined)
        return { data: [] };

    return semanticTokensProvider.provideDocumentSemanticTokens(document);
});

interface ExampleSettings {
    maxNumberOfProblems: number;
}

const defaultSettings: ExampleSettings = { maxNumberOfProblems: 1000 };
let globalSettings: ExampleSettings = defaultSettings;

let documentSettings: Map<string, Thenable<ExampleSettings>> = new Map();

connection.onDidChangeConfiguration(change => {
    if (hasConfigurationCapability) {
        documentSettings.clear();
    } else {
        globalSettings = <ExampleSettings>(
            (change.settings.languageServerExample || defaultSettings)
        );
    }

    documents.all().forEach(validateTextDocument);
});

function getDocumentSettings(resource: string): Thenable<ExampleSettings> {
    if (!hasConfigurationCapability) {
        return Promise.resolve(globalSettings);
    }
    let result = documentSettings.get(resource);
    if (!result) {
        result = connection.workspace.getConfiguration({
            scopeUri: resource,
            section: 'pabcnet-server-ts'
        });
        documentSettings.set(resource, result);
    }
    return result;
}

documents.onDidClose(e => {
    documentSettings.delete(e.document.uri);
});

documents.onDidChangeContent(change => {
    validateTextDocument(change.document);
    semanticTokensProvider.provideDocumentSemanticTokens(change.document);
});

async function validateTextDocument(textDocument: TextDocument): Promise<void> {

    let settings = await getDocumentSettings(textDocument.uri);

    let text = textDocument.getText();

    let pattern = /\b[A-Z]{2,}\b/g;
    let m: RegExpExecArray | null;

    let problems = 0;
    let diagnostics: Diagnostic[] = [];
    while ((m = pattern.exec(text)) && problems < settings.maxNumberOfProblems) {
        problems++;
        let diagnostic: Diagnostic = {
            severity: DiagnosticSeverity.Warning,
            range: {
                start: textDocument.positionAt(m.index),
                end: textDocument.positionAt(m.index + m[0].length)
            },
            message: `${m[0]} is all uppercase.`,
            source: 'ex'
        };
        if (hasDiagnosticRelatedInformationCapability) {
            diagnostic.relatedInformation = [
                {
                    location: {
                        uri: textDocument.uri,
                        range: Object.assign({}, diagnostic.range)
                    },
                    message: 'Spelling matters'
                },
                {
                    location: {
                        uri: textDocument.uri,
                        range: Object.assign({}, diagnostic.range)
                    },
                    message: 'Particularly for names'
                }
            ];
        }
        diagnostics.push(diagnostic);
    }

    connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
}

connection.onDidChangeWatchedFiles(_change => {
    connection.console.log('We received an file change event');
});

connection.onDocumentFormatting(formatDocument)

async function formatDocument(params: DocumentFormattingParams) {
    const text = documents.get(params.textDocument.uri)?.getText()
    if (!text) return

    const tree = grammar.tree(text)
    if (tree.rootNode.hasError()) {
        connection.window.showErrorMessage("Невозможно отформатировать синтаксически неверную программу")
        return
    }

    let newText = format(tree.rootNode.firstChild)

    const edits: TextEdit[] = []
    edits.push(
        {
            range: {
                start: { line: 0, character: 0 },
                end: {
                    line: Number.MAX_VALUE,
                    character: Number.MAX_VALUE
                }
            },
            newText: ''
        },
        {
            range: {
                start: { line: 0, character: 0 },
                end: { line: 0, character: 0 }
            },
            newText
        }
    )

    return edits
}

// This handler provides the initial list of the completion items.
connection.onCompletion(
    (_textDocumentPosition: TextDocumentPositionParams): CompletionItem[] => {
        // The pass parameter contains the position of the text document in
        // which code complete got requested. For the example we ignore this
        // info and always provide the same completion items.

        return completionItems
    }
);

connection.onCompletionResolve(
    (item: CompletionItem): CompletionItem => {
        if (item.data === 1) {
            item.detail = 'TypeScript details';
            item.documentation = 'TypeScript documentation';
        } else if (item.data === 2) {
            item.detail = 'JavaScript details';
            item.documentation = 'JavaScript documentation';
        }
        return item;
    }
);

documents.listen(connection);

connection.listen();
