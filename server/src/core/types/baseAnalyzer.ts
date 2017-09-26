import { IFeature, IFeaturesRegistrator } from './features';
import * as vsServer from 'vscode-languageserver';
import { EditableResource } from '@archipa/icl/dist/compiler/resource/editableResource';
import { ConfigurationFile } from '@archipa/icl/dist/core/ast/configurationFile';
import { ICLCompiler } from '@archipa/icl/dist/compiler/iclCompiler';
import { SettingsBlockDeclaration } from '@archipa/icl/dist/core/ast/declaration/settings/settingsBlockDeclaration';
import { ICacheableResource } from '@archipa/icl/dist/core/types/resource';
import { CompilationOutput } from '../../core/types/compile';

export abstract class BaseAnalyzer implements IFeaturesRegistrator {

    readonly documents: vsServer.TextDocuments;
    readonly connection: vsServer.IConnection;
    readonly compiler: ICLCompiler;
    readonly compilationCache: Map<string, CompilationOutput>;

    constructor(connection: vsServer.IConnection, documents: vsServer.TextDocuments) {
        this.connection = connection;
        this.documents = documents;
        // create a new instance of native ICL parser
        this.compiler = new ICLCompiler();
        this.compilationCache = new Map();
        this.registerFeatures();
    }

    public registerFeatures() {
        for (let feature of this.getFeatures()) {
            new feature(this).selfRegister();
        }
    }

    public getLastCompile(resource: EditableResource<string, ConfigurationFile>): CompilationOutput | undefined {
        return this.compilationCache.get(resource.uri);
    }

    abstract getResource(uri: string, content?: string): EditableResource<string, ConfigurationFile> & ICacheableResource<ConfigurationFile>;

    abstract getFeatures(): (new (registrator: IFeaturesRegistrator) => IFeature)[];
}
