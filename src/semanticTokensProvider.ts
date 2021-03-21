import * as Parser from 'web-tree-sitter'
import { Provider } from './highlighting';

export async function initializeSemanticTokensProvider(parser: Parser) {
    // let syntaxConfiguration = await connection.workspace.getConfiguration("syntax");
    // let enabledTerms = syntaxConfiguration.get("highlightTerms");
    // let highlightComment = syntaxConfiguration.get("highlightComment");
    // let debugDepth = syntaxConfiguration.get("debugDepth");

    // semanticTokensProvider = new Provider(enabledTerms, highlightComment, debugDepth);
    return new Provider(parser);
}