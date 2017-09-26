import * as vsServer from 'vscode-languageserver';
import { EditableResource } from '@archipa/icl/dist/compiler/resource/editableResource';
import { ConfigurationFile } from '@archipa/icl/dist/core/ast/configurationFile';
import { ICLCompiler } from '@archipa/icl/dist/compiler/iclCompiler';
import { SettingsBlockDeclaration } from '@archipa/icl/dist/core/ast/declaration/settings/settingsBlockDeclaration';
import { ICacheableResource } from '@archipa/icl/dist/core/types/resource';
import { LexYaccError } from '@archipa/icl/dist/core/types/analysis';
import { CompilationOutput } from '../../core/types/compile';

export interface IFeaturesRegistrator {
    documents: vsServer.TextDocuments,
    connection: vsServer.IConnection,
    /**
     * returns the last compilation output 
     */
    getLastCompile(resource: EditableResource<string, ConfigurationFile>): CompilationOutput | undefined,
    /**
     * returns the associated FsResource based on {@param uri} 
     */
    getResource(uri: string, content?: string): EditableResource<string, ConfigurationFile> & ICacheableResource<ConfigurationFile>,
    /**
     * returns the list of features to be registred (such as HoverFeature, AutoCompletionFeature...)
     */
    getFeatures(): (new (registrator: IFeaturesRegistrator) => IFeature)[]
}

export interface IFeature {
    selfRegister(): void;
}

/*declare var Feature: {
    new <A extends IFeature, B extends IFeaturesRegistrator>(registrator: B): IFeature
}*/

export interface IHoverFeature<T extends IFeaturesRegistrator> extends IFeature {
    onHover(document: vsServer.TextDocument, position: vsServer.Position): Thenable<vsServer.Hover>;
}

export interface IAutoCompleteFeature<T extends IFeaturesRegistrator> extends IFeature {
    onCompletion(textDocumentPosition: vsServer.TextDocumentPositionParams): Thenable<Array<vsServer.CompletionItem>>;
    onCompletionResolve(item: vsServer.CompletionItem): Thenable<vsServer.CompletionItem>;
}

export interface IDefinitionFeature<T extends IFeaturesRegistrator> extends IFeature {
    onDefinition(documentInfos: vsServer.TextDocumentPositionParams): Thenable<vsServer.Location>
}