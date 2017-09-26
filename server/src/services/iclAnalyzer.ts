import * as vsServer from 'vscode-languageserver';
import { RequestType } from 'vscode-languageserver';
import Uri from 'vscode-uri';
import { ICLCompiler } from '@archipa/icl/dist/compiler/iclCompiler';
import { EditableResource } from '@archipa/icl/dist/compiler/resource/editableResource';
import { FsResource } from '@archipa/icl/dist/compiler/resource/fsResource';
import { CompilerOption } from '@archipa/icl/dist/core/enums/compilerOption';
import { ResourceManager } from '@archipa/icl/dist/compiler/resource/resourceManager';
import { FsWatcher } from '@archipa/icl/dist/compiler/resource/fsWatcher';
import { SettingsBlockDeclaration } from '@archipa/icl/dist/core/ast/declaration/settings/settingsBlockDeclaration';
import { ICacheableResource, IResource } from '@archipa/icl/dist/core/types/resource';
import { GlobalSettings } from '../../../client/src/core/types/settings';
import { DocumentUtils } from '../utils/documentUtils';
import { ConfigurationFile } from '@archipa/icl/dist/core/ast/configurationFile';
import { LexYaccError } from '@archipa/icl/dist/core/types/analysis';
import { IFeature, IFeaturesRegistrator } from '../core/types/features';
import { BaseAnalyzer } from '../core/types/baseAnalyzer';
import { NoMatchAtCursorBehaviour } from '../core/enums/analysis';
import { HoverFeature } from '../features/hoverFeature';
import { AutoCompleteFeature } from '../features/autoCompleteFeature';
import { UriUtils } from '../utils/uriUtils';
import { CompilationOutput } from '../core/types/compile';
import { IDisposable } from '@archipa/icl/dist/core/types/common';
import { DefinitionFeature } from '../features/definitionFeature';
import * as Util from 'util';
import { Diagnostics } from '../services/diagnostics';
import * as Path from 'path';

export class ICLAnalyzer extends BaseAnalyzer {

    // refresh
    private static readonly RENDER_EVERY = 200;// ms
    private static readonly MAX_QUEUE_SIZE = 5;

    private readonly serverCapabilities: vsServer.InitializeResult = {
        capabilities: {
            // Tell the client that the server works in FULL text document sync mode
            textDocumentSync: vsServer.TextDocumentSyncKind.Full,
            // // support type info on hover
            hoverProvider: true,
            // // support goto definition
            definitionProvider: true,
            // // support find usage (ie: find all references)
            //referencesProvider: true,
            // // Tell the client that the server support code complete
            // Tell the client that the server support code complete
            completionProvider: {
                resolveProvider: true,
                triggerCharacters: ['.', ':', '@']
            }
        }
    }

    private readonly doc2resources: Map<string, EditableResource<string, ConfigurationFile>>;
    private readonly resourceManager: ResourceManager;
    private readonly resourceWatcher: FsWatcher;
    private readonly requestQueues: Map<string, Array<string>>;

    private timer: number;
    private initialized: boolean;

    public settings: GlobalSettings;

    constructor(connection: vsServer.IConnection, documents: vsServer.TextDocuments) {
        super(connection, documents);
        this.resourceManager = new ResourceManager();
        this.resourceWatcher = new FsWatcher();
        this.doc2resources = new Map();
        this.initialized = false;
        this.requestQueues = new Map();
        this.validateEvery();
    }

    public requestValidation(textDocument: vsServer.TextDocument): void {
        if (textDocument && textDocument.getText()) {
            this.addPreviewRequest(textDocument.uri, textDocument.getText());
        }
    }

    public initialize(): vsServer.InitializeResult {
        return this.serverCapabilities;
    }

    public onInitialized() {
        this.initialized = true;
        this.registerAllRequests();
    }

    /**
     * Load/Create an ICL resource associated with the {@param uri}
     * All editable resources take their content primarly from the {@see document.getText()} 
     * and not from the disk, this is to offer live "parsing" and "compilation" 
     * and don't oblige the user to save the file everytime
     * @param uri the document's uri
     * @param content the document's content
     */
    public getResource(uri: string, content: string = ''): EditableResource<string, ConfigurationFile> & ICacheableResource<ConfigurationFile> {
        let resource: EditableResource<string, ConfigurationFile> & ICacheableResource<ConfigurationFile>;
        if (this.doc2resources.has(uri)) {
            resource = <EditableResource<string, ConfigurationFile> & ICacheableResource<ConfigurationFile>>this.doc2resources.get(uri);
        } else {
            resource = <EditableResource<string, ConfigurationFile> & ICacheableResource<ConfigurationFile>>new EditableResource<string, ConfigurationFile>(uri);
            resource.setCacheManager(this.resourceManager);
            resource.setWatcher(this.resourceWatcher);
            this.doc2resources.set(resource.getCacheKey(), resource);
        }
        if (content) {
            resource.setContent(content);
        }
        return resource;
    }

    public getFeatures(): (new (registrator: IFeaturesRegistrator) => IFeature)[] {
        return [HoverFeature, AutoCompleteFeature, DefinitionFeature];
    }

    private addPreviewRequest(uri: string, text: string) {
        if (this.requestQueues.has(uri) && (<Array<string>>this.requestQueues.get(uri)).length >= ICLAnalyzer.MAX_QUEUE_SIZE) {
            // remove the oldest element
            (<Array<string>>this.requestQueues.get(uri)).shift();
        } else if (!this.requestQueues.has(uri)) {
            this.requestQueues.set(uri, []);//init queue
        }
        (<Array<string>>this.requestQueues.get(uri)).push(text);
    }

    private validateICLDocument(uri: string, text: string) {
        if (text) {
            let diagnostics: vsServer.Diagnostic[] = [];
            let parsedURL = Uri.parse(uri);
            if (parsedURL.scheme === 'file' || parsedURL.scheme === 'untitled') {
                // load resource
                let iclResource = this.getResource(parsedURL.path, text);
                if (iclResource.hasChanged) {
                    let compiled = this.launchCompilation(iclResource);
                    this.connection.sendDiagnostics({ uri: uri, diagnostics });

                    if (compiled.error) {
                        let start = { line: 0, character: 0 };
                        let end = { line: 0, character: 0 };
                        let file = '';
                        if (compiled.error && compiled.error.hash && compiled.error.hash.loc) { // make sure we have something here
                            start = { line: Number(compiled.error.hash.loc.first_line) - 1, character: Number(compiled.error.hash.loc.first_column) };
                            end = { line: Number(compiled.error.hash.loc.last_line) - 1, character: Number(compiled.error.hash.loc.last_column) };
                            file = UriUtils.normalizeFilePath(Path.resolve(compiled.error.hash.loc.file_uri));
                        }

                        diagnostics.push({
                            severity: vsServer.DiagnosticSeverity.Error,
                            range: {
                                start: start,
                                end: end
                            },
                            message: Diagnostics.humanReadableError(compiled.error)
                        });
                        this.connection.sendDiagnostics({ uri: file ? file : uri, diagnostics });
                    }


                }
            }
        }
    }

    private validateEvery() {
        this.unschedulePreview();
        this.timer = setInterval((() => {
            if (this.requestQueues.size > 0) {
                for (let queue of this.requestQueues) {
                    if (queue[1].length > 0) {
                        this.validateICLDocument(queue[0], <string>queue[1].shift());
                    }
                }
            }
        }).bind(this), ICLAnalyzer.RENDER_EVERY);
    }

    private unschedulePreview() {
        if (this.timer) {
            clearInterval(this.timer);
        }
    }

    private registerAllRequests() {
        this.connection.onRequest((method, param1: Uri) => {
            let resource: undefined | IResource<string> & ICacheableResource<IResource<string>> & IDisposable = this.resourceManager.getResourceByUri(Uri.parse(param1.query).path);
            if (!resource || !(<any>resource).parsedContent) {
                return '{}';
            } else {
                let compiled = this.getLastCompile(<any>resource);
                return compiled ? JSON.stringify(compiled.compiled) : '{}';
            }
        });
    }

    private capitalizeFirstLetter(str: string) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }

    /**
     * Perform a full compilation of the provided resource
     * @param iclResource 
     */
    private launchCompilation(iclResource: EditableResource<string, ConfigurationFile>) {
        let compileOptions = undefined;
        // set the compile options flags
        for (let compileOption in this.settings.icl.compilation.options) {
            if (this.capitalizeFirstLetter(compileOption) in CompilerOption) {
                let compileOptionCode = <keyof typeof CompilerOption>this.capitalizeFirstLetter(compileOption);
                if ((<any>this.settings.icl.compilation.options)[compileOption] === true) {
                    compileOptions = compileOptions ? compileOptions & CompilerOption[compileOptionCode] : CompilerOption[compileOptionCode];
                }
            }
        }

        let compilationDone = false;
        let error = undefined;
        let originalError = undefined;
        let maxTry = 10;
        while (!compilationDone && maxTry-- > 0) {// while a resource has a commpilation error remove line error 
            try {
                // compile and save it into the cache
                this.compilationCache.set(iclResource.uri, this.compiler.compile(iclResource, [], compileOptions));
                compilationDone = true;
            } catch (e) {
                if (maxTry == 9) {
                    originalError = e;                    
                }
                error = e;            
                if (e.hash) {
                    if ((<LexYaccError>e).hash.loc.file_uri == iclResource.uri) {
                        // remove the error part
                        let confLines = iclResource.content().split('\n');
                        confLines.splice((<LexYaccError>e).hash.loc.first_line - 1,
                            (<LexYaccError>e).hash.loc.last_column - (<LexYaccError>e).hash.loc.first_column).join('\n');
                        iclResource.setContent(confLines.join('\n'));
                    } else {
                        compilationDone = true;
                    }
                }    
            }
        }
        if (error) {
            if (this.getLastCompile(iclResource)) {
                (<CompilationOutput>this.getLastCompile(iclResource)).error = originalError;
            } else {
                let compilationOutput: CompilationOutput = { ast: [], aliases: {}, compiled: {} };
                compilationOutput.error = originalError;
                this.compilationCache.set(iclResource.uri, compilationOutput);
            }
        }
        // error only the compiled json
        return (<CompilationOutput>this.getLastCompile(iclResource));
    }

}