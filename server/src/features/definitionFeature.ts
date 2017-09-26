import { IDefinitionFeature, IFeaturesRegistrator } from '../core/types/features';
import * as vsServer from 'vscode-languageserver';
import { DocumentUtils } from '../utils/documentUtils';
import { NoMatchAtCursorBehaviour } from '../core/enums/analysis';
import { UriUtils } from '../utils/uriUtils';
import { ASTNodeType } from '@archipa/icl/dist/core/enums/astNodeType';
import { Inheritance } from '@archipa/icl/dist/core/ast/declaration/settings/inheritance';
import { JSONPathExpression } from '@archipa/icl/dist/core/ast/base/jsonPathExpression';
import { SettingsBlockDeclaration } from '@archipa/icl/dist/core/ast/declaration/settings/settingsBlockDeclaration';
import { BaseNode } from '@archipa/icl/dist/core/ast/base/baseNode';
import { ASTNodeKind } from '@archipa/icl/dist/core/enums/astNodeKind';
import { Dependency } from '@archipa/icl/dist/core/ast/declaration/import/dependency';
import * as Path from 'path';
import { RangeComparison } from '../core/enums/rangeComparison';
import { PropertyDeclarator } from '@archipa/icl/dist/core/ast/declaration/settings/propertyDeclarator';
import { CompilationOutput } from '../core/types/compile';

export class DefinitionFeature implements IDefinitionFeature<IFeaturesRegistrator> {

    private static readonly FILE_NAME_EXT = '.icl';
    private readonly registrator: IFeaturesRegistrator;

    constructor(registrator: IFeaturesRegistrator) {
        this.registrator = registrator;
    }

    public onDefinition(documentInfos: vsServer.TextDocumentPositionParams): Thenable<vsServer.Location> {

        return new Promise((accept, reject) => {
            // look for the elements which is in documentInfo.position
            let wordLocation = DocumentUtils.getElementAtPosition(
                this.registrator.documents.get(documentInfos.textDocument.uri),
                documentInfos.position, NoMatchAtCursorBehaviour.Stop);
            // retrieve the associated document's FsResource
            let resource = this.registrator.getResource(UriUtils.getFilePath(documentInfos.textDocument.uri),
                this.registrator.documents.get(documentInfos.textDocument.uri).getText());
            // retrieve the last successfull compilation
            let lastCompilationOutput = this.registrator.getLastCompile(resource);

            if (lastCompilationOutput && lastCompilationOutput.ast && wordLocation.word) { // ok we have the last compilation and the selected word
                // retrieve the AST node located at the current position
                let match = DocumentUtils.getElementAtPosition(
                    this.registrator.documents.get(documentInfos.textDocument.uri),
                    documentInfos.position, NoMatchAtCursorBehaviour.LookLeft);
                // this will contain the matched node 
                let resolvedNode: BaseNode | undefined = undefined;

                if (match.word) {
                    // we look for an AST node located in the same spot
                    let astMatch: { match: BaseNode, type: RangeComparison } | undefined = DocumentUtils.searchForASTNode(resource.parsedContent, wordLocation);

                    if (astMatch) { // ok we found something in the ASTTree
                        let astNode = astMatch.match;
                        /* go upper until we reach either a property declarator or a settings block declaration or the root
                            until we find something
                         */
                        while (astNode && !resolvedNode) {

                            if (astNode.type == ASTNodeType.ImportFile) {  // file imports e.g take definitions
                                // get current document uri 
                                let dependencyURI = UriUtils.getFilePath(
                                    Path.join(Path.dirname(documentInfos.textDocument.uri), (<Dependency>astNode).data))
                                    + DefinitionFeature.FILE_NAME_EXT;
                                for (let ast of lastCompilationOutput.ast) {
                                    if (ast.loc.file_uri.toLowerCase() == dependencyURI.toLowerCase()) {
                                        resolvedNode = ast;
                                        break;
                                    }
                                }
                            } else if (astNode.type == ASTNodeType.SettingsBlockDeclaration) { // bingo sb declaration
                                // ok let's go after the origin block declaration
                                resolvedNode = astNode;
                            } else if (astNode.type == ASTNodeType.SettingsBlockInheritance) { // e.g. app "webapp" from ...
                                let parentSettingsBlock = undefined;
                                // search for the corresponding sb
                                if (astNode instanceof Inheritance && (<Inheritance>astNode).isAlias()) {
                                    // the current inheritance is an alias so pick the corresponding sb directly
                                    parentSettingsBlock = [lastCompilationOutput.aliases[(<Inheritance>astNode).data]];
                                } else if (astNode instanceof Inheritance) {
                                    // else we look for the inherited sb
                                    parentSettingsBlock = DocumentUtils.searchSettingsBlockDeclarationLike(
                                        lastCompilationOutput.ast, (<Inheritance>astNode).getPath(), true);
                                }
                                // we pick the first match
                                if (parentSettingsBlock && parentSettingsBlock.length > 0) {
                                    resolvedNode = parentSettingsBlock[0];
                                }
                            } else if (astNode.type == ASTNodeType.Identifier && astNode.kind == ASTNodeKind.Property) {
                                // ok it's a property so we need to find first the settings block that is declared in
                                let parentSettingsBlock = astNode.parent;
                                let searchedPropertyName = wordLocation.word;
                                while (parentSettingsBlock && parentSettingsBlock.type !== ASTNodeType.SettingsBlockDeclaration) {
                                    parentSettingsBlock = parentSettingsBlock.parent;
                                }
                                if (parentSettingsBlock) {
                                    // check if this settings block has inherit properties
                                    if ((<SettingsBlockDeclaration>parentSettingsBlock).inheritFrom) {
                                        for (let inheritance of (<SettingsBlockDeclaration>parentSettingsBlock).inheritFrom.inheritances) {
                                            // get inherited parent 
                                            let parentSettingsBlocks = (<Inheritance>inheritance).isAlias()
                                                ? [lastCompilationOutput.aliases[(<Inheritance>inheritance).data]]
                                                : DocumentUtils.searchSettingsBlockDeclarationLike(lastCompilationOutput.ast, (<Inheritance>inheritance).getPath(), true);
                                            for (let parentSettingsBlock of parentSettingsBlocks) {
                                                // get all parent properties 
                                                let inheritedProperties = DocumentUtils.getAllSettingsBlockFields(parentSettingsBlock, lastCompilationOutput);
                                                for (let inheritedProperty of inheritedProperties) {
                                                    if (inheritedProperty.propertyDeclaration.identifier.name == searchedPropertyName) {
                                                        resolvedNode = inheritedProperty.propertyDeclaration;
                                                        break;
                                                    }
                                                }
                                                if (resolvedNode) {
                                                    break;
                                                }
                                            }
                                            if (resolvedNode) {
                                                break;
                                            }
                                        }
                                    }
                                }
                            } else if (astNode.type == ASTNodeType.JSONPathExpression) {
                                resolvedNode = DocumentUtils.evaluateJSPathExpression((<JSONPathExpression>astNode).expression, lastCompilationOutput);
                            }
                            astNode = astNode.parent;
                        }
                    }
                }
                if (resolvedNode) {
                    accept(vsServer.Location.create(UriUtils.normalizeFilePath(resolvedNode.loc.file_uri),
                        vsServer.Range.create(resolvedNode.loc.first_line - 1, resolvedNode.loc.first_column,
                            resolvedNode.loc.last_line - 1, resolvedNode.loc.last_column)));
                } else {
                    accept(undefined);
                }
            }
        });
    }

    public selfRegister(): void {
        this.registrator.connection.onDefinition(this.onDefinition.bind(this));
    }

}