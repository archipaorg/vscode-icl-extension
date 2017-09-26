import * as vs from 'vscode';
import * as yaml from 'js-yaml';
import * as path from 'path';

import { OUTPUT_FORMAT, GlobalSettings } from '../core/types/settings';
import { ICLClient } from '../iclClient';
import { NotificationUtils } from '../core/utils/notificationUtils';
import { VsCommand } from '../core/types/command';
import { Disposable } from '../core/types/disposable';

/**
 * Content Preview Command 
 * This command add a side panel for live yaml/json preveiw
 */
export class ContentPreview extends VsCommand<ICLClient> implements vs.TextDocumentContentProvider {

    private static readonly JSON_FORMAT: string = 'json';
    private static readonly YAML_FORMAT: string = 'yaml';

    // max pending preview requests that can be kept in the queue
    private static readonly MAX_QUEUE_SIZE = 15;
    // refresh frequency in ms
    private static readonly RENDER_EVERY = 300;

    private readonly _onDidChange;
    private readonly renderQueue: Array<vs.Uri>;
    private timer: NodeJS.Timer;

    public readonly id: string = 'icl.previewToSide';

    constructor(client: ICLClient) {
        super(client);
        this.renderQueue = [];
        this._onDidChange = new vs.EventEmitter<vs.Uri>();
        this.markAsDisposable(vs.workspace.registerTextDocumentContentProvider('icl-preview', this));
        this.markAsDisposable(vs.workspace.onDidOpenTextDocument(this.preview.bind(this)));
        this.markAsDisposable(vs.workspace.onDidChangeTextDocument(this.preview.bind(this)));
        this.refreshPreviewEvery();
    }

    /**
    * Open a side tab for live generated output 
    */
    public exec() {
        const editor = vs.window.activeTextEditor;
        if (editor == null) {
            NotificationUtils.noActiveWindow();
        } else {
            return vs.commands.executeCommand(
                'vscode.previewHtml',
                ContentPreview.canonicalPreviewUri(editor.document.uri),
                ContentPreview.getViewColumn(),
                `ICL preview '${path.basename(editor.document.fileName)}'`
            ).then((success) => { }, (reason) => {
                NotificationUtils.couldNotRenderICL(reason);
            });
        }
    }

    public provideTextDocumentContent(uri: vs.Uri, token: vs.CancellationToken): vs.ProviderResult<string> {
        return this.registrator.client.sendRequest('icl-preview', uri).then(((data) => {
            return ContentPreview.body(ContentPreview.prettyPrintObject(data, (<GlobalSettings>this.registrator.settings).icl.compilation.output));
        }).bind(this)).catch((e) => {
            return ContentPreview.errorMessage(e.message);
        });
    }

    /**
     * ask for a refreshed preview of {@param doc}
     * @param doc 
     */
    public preview(doc: { content: any, document: vs.TextDocument }): void {
        if (doc && doc.document && doc.document.uri) {
            this.addPreviewRequest(doc.document.uri);
        }
    }

    /**
     * display a the generated output in json or yaml format
     * @param json 
     * @param outputFormat 
     */
    public static prettyPrintObject(json: string, outputFormat: string): string {
        if (outputFormat == OUTPUT_FORMAT.YAML) {
            return ContentPreview.codeLiteral(yaml.safeDump(JSON.parse(json)));
        } else {
            return ContentPreview.codeLiteral(JSON.stringify(JSON.parse(json), null, 4));
        }
    }

    public get onDidChange(): vs.Event<vs.Uri> {
        return this._onDidChange.event;
    }

    public update = (uri: vs.Uri) => {
        this._onDidChange.fire(uri);
    }

    public dispose() {
        this.unschedulePreview();
        super.dispose();
    }

    private static codeLiteral(code: string): string {
        return `<pre><code>${code}</code></pre>`
    }

    private static body(body: string): string {
        return `<html><body>${body}</body></html>`
    }

    private static errorMessage = (message: string): string => {
        return `<i><pre>${message}</pre></i>`;
    }

    private addPreviewRequest(uri: vs.Uri) {
        if (this.renderQueue.length >= ContentPreview.MAX_QUEUE_SIZE) {
            // remove the oldest element
            this.renderQueue.shift();
        }
        this.renderQueue.push(uri);
    }

    private refreshPreviewEvery() {
        this.unschedulePreview();
        this.timer = setInterval((() => {
            if (this.renderQueue.length != 0) {
                let uri = this.renderQueue.shift();
                if (uri) {
                    this.update(ContentPreview.canonicalPreviewUri(uri));
                }
            }
        }).bind(this), ContentPreview.RENDER_EVERY);
    }

    private unschedulePreview() {
        if (this.timer) {
            clearInterval(this.timer);
        }
    }

    private static getViewColumn(): vs.ViewColumn | undefined {

        const active = vs.window.activeTextEditor;

        if (!active) {
            return vs.ViewColumn.One;
        }

        switch (active.viewColumn) {
            case vs.ViewColumn.One:
                return vs.ViewColumn.Two;
            case vs.ViewColumn.Two:
                return vs.ViewColumn.Three;
        }
        return active.viewColumn;
    }

    private static canonicalPreviewUri(fileUri: vs.Uri) {
        return fileUri.with({
            scheme: 'icl-preview',
            path: `${fileUri.path}.rendered`,
            query: fileUri.toString()
        });
    }
}

