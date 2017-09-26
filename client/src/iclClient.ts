import * as vs from 'vscode';
import * as vsClient from 'vscode-languageclient';
import * as path from 'path';
import { ContentPreview } from './commands/contentPreview';
import { GlobalSettings } from './core/types/settings';
import { VsCommandRegistrator, VsCommand } from './core/types/command';

const LANGUAGE_ID: string = 'icl';
const CLIENT_NAME: string = 'ICL Client';

/**
 * Manages the communication with the language server 
 * Performs the commands registrations
 */
export class ICLClient extends VsCommandRegistrator {
    private static readonly CloseOtherEditorCommandId = "workbench.action.closeEditorsInOtherGroups";
    // The debug options for the server
    private readonly debugOptions = { execArgv: ['--nolazy', '--debug=6009'] };
    // If the extension is launched in debug mode then the debug server options are used
    // Otherwise the run options are used
    private readonly serverOptions: vsClient.ServerOptions;
    // Options to control the language client
    private readonly clientOptions: vsClient.LanguageClientOptions = {
        // Register the server for icl documents
        documentSelector: [LANGUAGE_ID],
        synchronize: {
            // Synchronize the setting section 'ichiroConfigurationLanguage' to the server
            configurationSection: LANGUAGE_ID,
            // Notify the server about file changes to '.clientrc files contain in the workspace
            fileEvents: vs.workspace.createFileSystemWatcher('**/.clientrc')
        }
    };
    // properties
    private readonly _serverUri: string;
    // language client 
    private _client: vsClient.LanguageClient;

    constructor(serverUri: string, private readonly debug: boolean = true) {
        super();
        this._serverUri = serverUri;

        this.serverOptions = {
            run: { module: this.serverUri, transport: vsClient.TransportKind.ipc },
            debug: { module: this.serverUri, transport: vsClient.TransportKind.ipc, options: this.debugOptions }
        };
        this.selfRegister();
        return this;
    }

    /**
     * Starts the client and marks it as disposable
     */
    public start() {
        this._client = new vsClient.LanguageClient(this.serverUri, CLIENT_NAME, this.serverOptions, this.clientOptions);
        this.markAsDisposable(this.client.start());
        // TODO make it cleaner without setTimeout
        /*setTimeout((()=> {            
            this.contentPreviewer.previewIclDocument();
        }).bind(this.contentPreviewer), 800);*/
        return this;
    }

    public getCommandsList(): (new (registrator: VsCommandRegistrator) => VsCommand<VsCommandRegistrator>)[] {
        return [ContentPreview];
    }

    /**
     * returns the current extension settings
     */
    public get settings(): GlobalSettings {
        return {
            icl: {
                compilation: vs.workspace.getConfiguration('icl').get('compilation'),
                trace: vs.workspace.getConfiguration('icl').get('trace')
            }
        };
    }

    /**
     * get server's module uri
     * @param uri 
     */
    public get serverUri() {
        return this._serverUri;
    }

    /**
     * get the language client instance
     */
    public get client(): vsClient.LanguageClient {
        return this._client;
    }

    private selfRegister() {
        // TODO add a settings option to auto open the preview pane
        /*vs.workspace.onDidOpenTextDocument((doc) => {
            if (doc && doc.languageId === 'icl') {
                vs.commands.executeCommand(ICLClient.CloseOtherEditorCommandId).then((() => {
                    vs.commands.executeCommand('icl.previewToSide')
                }).bind(this)).then(() => { }, (e) => console.error(e));
            }
        }, this);*/
    }

}
