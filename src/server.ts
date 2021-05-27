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
import { keywordCompletionItems, updateCompletion } from './completion'

let connection = createConnection(ProposedFeatures.all);
let documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);
export let completionItems: CompletionItem[] = []

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
                resolveProvider: false
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
});

let currentText = ""

documents.onDidOpen(e => {
    updateCompletion(currentText, e.document)
    currentText = e.document.getText();
})

documents.onDidClose(e => {
    documentSettings.delete(e.document.uri);
});

documents.onDidChangeContent(change => {
    semanticTokensProvider.provideDocumentSemanticTokens(change.document);
    updateCompletion(currentText, change.document)
    currentText = change.document.getText()
});

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
            newText: format(tree.rootNode.firstChild)
        }
    )

    return edits
}

connection.onCompletion(
    (_textDocumentPosition: TextDocumentPositionParams): CompletionItem[] => {
        return completionItems
    }
);

documents.listen(connection);

connection.listen();
