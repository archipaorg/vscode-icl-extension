import { ConfigurationFile } from '@archipa/icl/dist/core/ast/configurationFile';
import { SettingsBlockDeclaration } from '@archipa/icl/dist/core/ast/declaration/settings/settingsBlockDeclaration';
import { LexYaccError } from '@archipa/icl/dist/core/types/analysis';

export type CompilationOutput = {
    ast: Array<ConfigurationFile>;
    aliases: {
        [key: string]: SettingsBlockDeclaration;
    };
    compiled: Object,
    error?: LexYaccError
}