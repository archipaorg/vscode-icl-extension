import * as vsServer from 'vscode-languageserver';
import { IHoverFeature, IFeaturesRegistrator, IAutoCompleteFeature } from '../core/types/features';
import { DocumentUtils, WordLocation } from '../utils/documentUtils';
import { NoMatchAtCursorBehaviour } from '../core/enums/analysis';
import { JSONPathExpression } from '@archipa/icl/dist/core/ast/base/jsonPathExpression';
import { UriUtils } from '../utils/uriUtils';
import { BaseNode } from '@archipa/icl/dist/core/ast/base/baseNode';
import { RangeComparison } from '../core/enums/rangeComparison';
import { ConfigurationFile } from '@archipa/icl/dist/core/ast/configurationFile';
import { SettingsBlockDeclaration } from '@archipa/icl/dist/core/ast/declaration/settings/settingsBlockDeclaration';
import { unique } from '../utils/arrUtils';
import * as FS from 'fs';
import * as Path from 'path';
import { GlobSync, sync } from 'glob';
import { PropertyDeclarator } from '@archipa/icl/dist/core/ast/declaration/settings/propertyDeclarator';
import { Inheritance } from '@archipa/icl/dist/core/ast/declaration/settings/inheritance';
import { ASTNodeType } from '@archipa/icl/dist/core/enums/astNodeType';
import { CompilationOutput } from "src/core/types/compile";
import { IResource } from '@archipa/icl/dist/core/types/resource';
import { FsResource } from '@archipa/icl/dist/compiler/resource/fsResource';

export class AutoCompleteFeature implements IAutoCompleteFeature<IFeaturesRegistrator> {

    private static readonly keywords = [
        {
            keyword: 'take',
            doc: 'Import an icl file',
            id: 'keyword_take'
        },
        {
            keyword: 'apply',
            doc: 'Call mixin block',
            id: 'keyword_apply'
        }
    ];

    private readonly registrator: IFeaturesRegistrator;


    constructor(registrator: IFeaturesRegistrator) {
        this.registrator = registrator;
    }

    /**
     * Called onCompletion event 
     * @param textDocumentPosition 
     */
    public onCompletion(textDocumentPosition: vsServer.TextDocumentPositionParams): Thenable<Array<vsServer.CompletionItem>> {
        // contains the list of suggestions that will be returned
        let suggestions: Array<vsServer.CompletionItem> = [];
        // current doc uri
        let documentURI = UriUtils.getFilePath(textDocumentPosition.textDocument.uri);
        // current doc
        let document = this.registrator.documents.get(textDocumentPosition.textDocument.uri);
        // get the the word located at the current position
        let wordLocation = DocumentUtils.getElementAtPosition(document, textDocumentPosition.position, NoMatchAtCursorBehaviour.LookLeft);
        // get the previous word located just before
        let previousWord = DocumentUtils.getPreviousWord(document, wordLocation);
        // attempt to retrieve the corresponding block in the AST        
        let resource = this.registrator.getResource(documentURI);
        // retrieve the latest AST from the compilation cache
        let lastCompilationOutput = this.registrator.getLastCompile(resource);
        /********************************************************************************************************************
         * The basic main idea here is that based on the current cursor position, the current word and the previous one 
         * we can know with almost 90% of certitude where we are in the document and based 
         * on that we attempt to make "smart" suggestions to the user
         *******************************************************************************************************************/

        if (lastCompilationOutput && lastCompilationOutput.ast.length > 0) { // take the latest successfull compilation

            let astMatch: { match: BaseNode, type: RangeComparison } | undefined
                = DocumentUtils.searchForASTNode(resource.parsedContent, wordLocation, true);

            if (!astMatch) {
                // if nothing matched we consider that we are simply in a ConfigurationFile (top level)
                astMatch = {
                    match: <ConfigurationFile>resource.parsedContent,
                    type: RangeComparison.IN
                }
            }

            switch (astMatch.match.type) {
                case ASTNodeType.SettingsBlockComplexValue:
                    astMatch.match = astMatch.match.parent;
                case ASTNodeType.SettingsBlockDeclaration:
                    if (previousWord.word.indexOf('=') !== -1) {
                        suggestions = suggestions.concat(AutoCompleteFeature.autoCompleteJSONExpression(wordLocation.word, lastCompilationOutput));
                    } else if ((<SettingsBlockDeclaration>astMatch.match).inheritFrom) {
                        // get all settings block properties 
                        for (let inheritance of (<SettingsBlockDeclaration>astMatch.match).inheritFrom.inheritances) {
                            // get inheritance sb 
                            let parentSettingsBlocks = DocumentUtils.searchSettingsBlockDeclarationLike(lastCompilationOutput.ast, (<Inheritance>inheritance).getPath(), true);
                            for (let parentSettingsBlock of parentSettingsBlocks) {
                                suggestions = suggestions.concat(AutoCompleteFeature.autoCompleteProperties(parentSettingsBlock, lastCompilationOutput, wordLocation.word.split('.')));
                            }
                        }
                    }
                    break;

                case ASTNodeType.ConfigurationFile:
                default:
                    suggestions = suggestions.concat(AutoCompleteFeature.autoCompleteKeywords(wordLocation));

                    if (previousWord.word.trim() == 'take' || previousWord.word.endsWith(',')) {
                        // we are trying to autocomplete an import declaration
                        try {
                            suggestions = suggestions.concat(AutoCompleteFeature.autoCompleteImportFile(resource, wordLocation));
                        } catch (e) {
                            //console.log(e);
                        }
                    }

                    if (wordLocation.word.startsWith('"') && previousWord.word != '=') { // we are declaring the sb namespace
                        // filter set on the sb namespace
                        let sbNamespaceFilter: Array<string> = [];
                        /**
                         * it means the user has typed sbIdentifier "part1" "part2"...so we are in sb namespace declaration
                         */
                        // it's a settings block namespace 
                        // so we must get the full previous expressed namespace
                        /**
                         * we take the current word and unquotes it 
                         */
                        sbNamespaceFilter.unshift(wordLocation.word.replace(/"/g, ''));
                        // then we go back until the settings block identifier declaration, we do this in order to get the full namespace path already expressed
                        while (previousWord.word && previousWord.word.startsWith('"')) {// we take all the previous namespace parts and remove their double quotes
                            sbNamespaceFilter.unshift(previousWord.word.replace(/"/g, ''));
                            previousWord = DocumentUtils.getPreviousWord(document, previousWord);
                        }
                        // we then took the settings block identifier
                        if (!previousWord.word.startsWith('"')) {
                            sbNamespaceFilter.unshift(previousWord.word);
                        }
                        // filter set on the sb namespace
                        suggestions = suggestions.concat(AutoCompleteFeature.autoCompleteSettingsBlock(sbNamespaceFilter, wordLocation, lastCompilationOutput));
                    } else if (previousWord.word.toLowerCase() == 'apply') {
                        // the previous word was apply so we must suggest some aliased sb e.g app "web" apply WebAp..
                        Object.keys(lastCompilationOutput.aliases).forEach((key) => {
                            if (key.toLowerCase().startsWith(wordLocation.word.toLowerCase())) {
                                suggestions.push(
                                    {
                                        label: key,
                                        kind: vsServer.CompletionItemKind.Function,
                                        data: key,
                                        detail: 'alias',
                                        documentation: (<any>lastCompilationOutput).aliases[key].toString(),
                                        insertText: key
                                    }
                                );
                            }
                        });
                    } else if (wordLocation.word.startsWith('@') && previousWord.word) { // we are settings a property value...e.g. @param..
                        // search for an alias with the name previousWord.word
                        suggestions = suggestions.concat(AutoCompleteFeature.autoCompleteMixinParams(previousWord.word, wordLocation.word, lastCompilationOutput));
                    } else if (previousWord.word.indexOf('=') !== -1) {
                        suggestions = suggestions.concat(AutoCompleteFeature.autoCompleteJSONExpression(wordLocation.word, lastCompilationOutput));
                    } else {
                        // suggest aliases
                        suggestions = suggestions.concat(AutoCompleteFeature.autoCompleteAlias(wordLocation, lastCompilationOutput));
                        // filter set on the sb namespace
                        suggestions = suggestions.concat(AutoCompleteFeature.autoCompleteSettingsBlock(wordLocation.word.split('.'), wordLocation, lastCompilationOutput));
                    }
                    break;
            }
        } else {

            suggestions = suggestions.concat(AutoCompleteFeature.autoCompleteKeywords(wordLocation));

            if (previousWord.word.trim() == 'take' || previousWord.word.endsWith(',')) {
                // we are trying to autocomplete an import declaration
                try {
                    suggestions = suggestions.concat(AutoCompleteFeature.autoCompleteImportFile(resource, wordLocation));
                } catch (e) {
                    //console.log(e);
                }
            }
        }

        suggestions = unique<vsServer.CompletionItem, string>(suggestions, (item) => {
            return item.label;
        });

        return new Promise((accept, reject) => {
            accept(suggestions);
        });
    }

    public onCompletionResolve(item: vsServer.CompletionItem): Thenable<vsServer.CompletionItem> {
        if (item.data === 1) {
            item.detail = 'TypeScript details',
                item.documentation = 'TypeScript documentation'
        } else if (item.data === 2) {
            item.detail = 'JavaScript details',
                item.documentation = 'JavaScript documentation'
        }
        //return item;
        return new Promise((accept, reject) => {
            accept(item);
        });
    }

    /**
     * Events registration
     */
    public selfRegister(): void {
        this.registrator.connection.onCompletion(this.onCompletion.bind(this));
        this.registrator.connection.onCompletionResolve(this.onCompletionResolve.bind(this));
    }

    private static autoCompleteMixinParams(mixinName: string, paramName: string, lastCompilationOutput: CompilationOutput) {
        let suggestions: Array<vsServer.CompletionItem> = [];
        let settingsBlock = lastCompilationOutput.aliases[mixinName];
        paramName = paramName.replace(/^@{1,2}/g, '').toLowerCase();
        if (settingsBlock && settingsBlock.params) {
            settingsBlock.params.elements.forEach((param) => {
                if (param.name.replace(/^@{1,2}/g, '').toLowerCase().startsWith(paramName) || paramName == '') {
                    suggestions.push(
                        {
                            label: param.name,
                            kind: vsServer.CompletionItemKind.Variable,
                            data: param.name,
                            insertText: param.name.replace('@', '').concat(' = ')
                        }
                    );
                    suggestions.push(
                        {
                            label: '@' + param.name,
                            kind: vsServer.CompletionItemKind.Variable,
                            data: '@' + param.name,
                            insertText: param.name.replace('@', '').concat(' = ')
                        }
                    );
                }
            });
        }
        return suggestions;
    }

    private static autoCompleteJSONExpression(expression: string, lastCompilationOutput: CompilationOutput): Array<vsServer.CompletionItem> {

        let suggestions: Array<vsServer.CompletionItem> = [];
        let settingsBlockNamespace = expression.split('.');
        let settingsBlockProperyNamespace: Array<string> = [];

        while (settingsBlockNamespace.length > 0 && suggestions.length == 0) {
            // try to find the property 
            let settingsBlocks = DocumentUtils.searchSettingsBlockDeclarationLike(lastCompilationOutput.ast, settingsBlockNamespace);
            if (settingsBlocks.length > 0) {
                for (let settingsBlock of settingsBlocks) {
                    let label = settingsBlockNamespace.filter((element) => { return element.length > 0; }).length > 1
                        ? (<Array<string>>settingsBlock.bundle.getJSONFullPath()).slice(settingsBlockNamespace.filter((element) => { return element.length > 0; }).length, (<Array<string>>settingsBlock.bundle.getJSONFullPath()).length).join('.')
                        : (<Array<string>>settingsBlock.bundle.getJSONFullPath()).join('.');

                    if (label.trim().length > 0) {
                        suggestions.push(
                            {
                                label: label,
                                kind: vsServer.CompletionItemKind.Module,
                                insertText: settingsBlockNamespace.length <= 1
                                    ? <string>settingsBlock.bundle.getJSONFullPath(true)
                                    : (<string>settingsBlock.bundle.getJSONFullPath(true)).replace(new RegExp('^' + settingsBlockNamespace.join('.'), 'gi'), ''),
                                data: settingsBlock.hash
                            }
                        );
                    } else {
                        // the settings block namespace matches exactly 
                        suggestions = suggestions.concat(AutoCompleteFeature.autoCompleteProperties(settingsBlock, lastCompilationOutput,
                            settingsBlockProperyNamespace.filter((elt, index, arr) => {
                                return index !== arr.length - 1;
                            }), ''));
                    }
                }
            } else {
                settingsBlockProperyNamespace.unshift(<string>settingsBlockNamespace.pop());
            }
        }
        return suggestions;
    }

    private static autoCompleteAlias(wordLocation: WordLocation, lastCompilationOutput: CompilationOutput) {
        let suggestions: Array<vsServer.CompletionItem> = [];
        Object.keys(lastCompilationOutput.aliases).forEach((key) => {
            if (key.toLowerCase().startsWith(wordLocation.word.toLowerCase())) {
                suggestions.push(
                    {
                        label: key,
                        kind: vsServer.CompletionItemKind.Function,
                        data: key,
                        detail: 'alias',
                        documentation: (<any>lastCompilationOutput).aliases[key].toString(),
                        insertText: key
                    }
                );
            }
        });
        return suggestions;
    }
    private static autoCompleteSettingsBlock(sbNamespaceFilter: Array<string>, wordLocation: WordLocation, lastCompilationOutput: CompilationOutput) {
        let suggestions = [];
        let settingsBlocks = DocumentUtils.searchSettingsBlockDeclarationLike(lastCompilationOutput.ast, sbNamespaceFilter);
        for (let settingsBlock of settingsBlocks) {
            let label: string = '';
            // set label 
            if (sbNamespaceFilter.length == 1) {
                // if the current typed word starts with : then remove them from the identifier (if the identifier is a lib)
                // this is to avoid supplementary :
                let libMarkers = /^(:{1,2})/gmi.exec(wordLocation.word);
                label = libMarkers
                    ? settingsBlock.bundle.identifier.name.replace(libMarkers[0], '')
                    : settingsBlock.bundle.identifier.name;
            } else {
                label = settingsBlock.bundle.namespace.elements[settingsBlock.bundle.namespace.elements.length - 1].data;
            }

            suggestions.push(
                {
                    label: label, // we were looking for a namespace match
                    kind: sbNamespaceFilter.length == 0 && settingsBlock.bundle.identifier.name != sbNamespaceFilter[0]
                        ? vsServer.CompletionItemKind.Function
                        : vsServer.CompletionItemKind.Class,
                    data: settingsBlock.hash
                }
            );
        }
        return suggestions;
    }

    private static autoCompleteProperties(settingsBlock: SettingsBlockDeclaration,
        lastCompilationOutput: CompilationOutput,
        typedNamespace: Array<string>,
        appendInsertChar: string = ' = '
    ) {
        let suggestions = [];
        for (let property of DocumentUtils.getAllSettingsBlockFields(settingsBlock, lastCompilationOutput, true)) {
            let propertyLabel = property.propertyDeclaration.identifier.name
                ? property.propertyDeclaration.identifier.name
                : (<string>(<SettingsBlockDeclaration>property.propertyDeclaration.right).bundle.getJSONFullPath(true)).replace(<string>settingsBlock.bundle.getJSONFullPath(true) + '.', '');
            suggestions.push(
                {
                    label: propertyLabel, // we were looking for a namespace match
                    kind: vsServer.CompletionItemKind.Reference,
                    insertText: propertyLabel + appendInsertChar,
                    detail: 'inherited',
                    data: property.propertyDeclaration.hash
                }
            );
        }
        return suggestions;
    }

    private static autoCompleteImportFile(resource: FsResource<string, ConfigurationFile>, wordLocation: WordLocation) {
        let suggestions = [];
        for (let file of sync(Path.join(Path.dirname(resource.uri), wordLocation.word + '*.icl'))) {
            suggestions.push(
                {
                    label: Path.basename(file), // we were looking for a namespace match
                    kind: vsServer.CompletionItemKind.File,
                    data: file,
                    insertText: Path.basename(file, '.icl')
                }
            );
        }
        return suggestions;
    }

    private static autoCompleteKeywords(wordLocation: WordLocation) {
        let suggestions = [];
        for (let keyword of AutoCompleteFeature.keywords) { // keyword autocompletion
            if (keyword.keyword.toLowerCase().startsWith(wordLocation.word.toLowerCase())) {
                suggestions.push(
                    {
                        label: keyword.keyword,
                        kind: vsServer.CompletionItemKind.Keyword,
                        data: keyword.id,
                        detail: keyword.doc
                    }
                );
            }
        }
        return suggestions;
    }

}