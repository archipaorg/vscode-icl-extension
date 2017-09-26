/* --------------------------------------------------------------------------------------------
 * Copyright (c) Archipa. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as vsServer from 'vscode-languageserver';
import Uri from 'vscode-uri';

import { GlobalSettings } from '../../client/src/core/types/settings';
import { UriUtils } from './utils/uriUtils';
import { ICLAnalyzer } from './services/iclAnalyzer';

// Create a connection for the server. The connection uses Node's IPC as a transport
let connection: vsServer.IConnection = vsServer.createConnection(new vsServer.IPCMessageReader(process), new vsServer.IPCMessageWriter(process));
// Create a simple text document manager. The text document manager
// supports full document sync only
let documents: vsServer.TextDocuments = new vsServer.TextDocuments();
// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

const iclCompiler: ICLAnalyzer = new ICLAnalyzer(connection, documents);
// After the server has started the client sends an initialize request. The server receives
// in the passed params the rootPath of the workspace plus the client capabilities. 
connection.onInitialize((params): vsServer.InitializeResult => {
	//workspaceRoot = params.rootPath;//let workspaceRoot: string | null | undefined;
	return iclCompiler.initialize();
});

connection.onInitialized((initializedParams: vsServer.InitializedParams) => {
	iclCompiler.onInitialized();
});

// The settings have changed. Is send on server activation
// as well.
connection.onDidChangeConfiguration((change) => {
	iclCompiler.settings = <GlobalSettings>change.settings;
	// Revalidate any open text documents
	documents.all().forEach(iclCompiler.requestValidation.bind(iclCompiler));
});

/*connection.onDefinition((documentInfo): vsServer.Location => {
	const documentURI = Uri.parse(documentInfo.textDocument.uri).path;
	// get resource from uri 
	iclCompiler.loadResource(documentURI);
	return vsServer.Location.create(documentInfo.textDocument.uri, 
		vsServer.Range.create(documentInfo.position, documentInfo.position));
    /*if (UriUtils.isFileProtocol(documentURI)) {
        const textDocument = documents.get(documentURI);
        return haskeroService.getDefinitionLocation(textDocument, documentInfo.position);
    }
});

// This handler provides the initial list of the completion items.
connection.onCompletion((textDocumentPosition: vsServer.TextDocumentPositionParams): vsServer.CompletionItem[] => {
	// The pass parameter contains the position of the text document in 
	// which code complete got requested. For the example we ignore this
	// info and always provide the same completion items.
	return [
		{
			label: 'TypeScript',
			kind: vsServer.CompletionItemKind.Text,
			data: 1
		},
		{
			label: 'JavaScript',
			kind: vsServer.CompletionItemKind.Text,
			data: 2
		}
	]
});

// This handler resolve additional information for the item selected in
// the completion list.
connection.onCompletionResolve((item: vsServer.CompletionItem): vsServer.CompletionItem => {
	if (item.data === 1) {
		item.detail = 'TypeScript details',
			item.documentation = 'TypeScript documentation'
	} else if (item.data === 2) {
		item.detail = 'JavaScript details',
			item.documentation = 'JavaScript documentation'
	}
	return item;
});


connection.onReferences((referenceParams: vsServer.ReferenceParams): vsServer.Location[] => {
	const documentURI = referenceParams.textDocument.uri;
	return <vsServer.Location[]>{};
    /*if (UriUtils.isFileProtocol(documentURI)) {
        const textDocument = documents.get(documentURI);
        return haskeroService.getReferencesLocations(textDocument, referenceParams.position);
    }
});
*/
documents.onDidOpen((event) => {
	return iclCompiler.requestValidation(event.document);
});

documents.onDidSave((event) => {
	return iclCompiler.requestValidation(event.document);
});

// The content of a text document has changed. This event is emitted
// when the text document first opened or when its content has changed.
documents.onDidChangeContent((event) => {
	return iclCompiler.requestValidation(event.document);
});

documents.onDidClose((event) => {
	return iclCompiler.requestValidation(event.document);
});

connection.listen();


/*connection.onDidChangeWatchedFiles((change) => {
	// Monitored files have change in VSCode
	connection.console.log('We received an file change event');
});*/

//let t: Thenable<string>;
/*
connection.onDidOpenTextDocument((params) => {
	// A text document got opened in VSCode.
	// params.textDocument.uri uniquely identifies the document. For documents store on disk this is a file URI.
	// params.textDocument.text the initial full content of the document.
	connection.console.log(`${params.textDocument.uri} opened.`);
});

connection.onDidChangeTextDocument((params) => {
	// The content of a text document did change in VSCode.
	// params.textDocument.uri uniquely identifies the document.
	// params.contentChanges describe the content changes to the document.
	connection.console.log(`${params.textDocument.uri} changed: ${JSON.stringify(params.contentChanges)}`);
});

connection.onDidCloseTextDocument((params) => {
	// A text document got closed in VSCode.
	// params.textDocument.uri uniquely identifies the document.
	connection.console.log(`${params.textDocument.uri} closed.`);
});
*/

// Listen on the connection
