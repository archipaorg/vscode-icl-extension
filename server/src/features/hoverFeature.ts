import * as vsServer from 'vscode-languageserver';
import { IHoverFeature, IFeaturesRegistrator } from '../core/types/features';
import { DocumentUtils, WordLocation } from '../utils/DocumentUtils';
import { NoMatchAtCursorBehaviour } from '../core/enums/analysis';
import { ICLAnalyzer } from '../services/iclAnalyzer';
import { BaseNode } from '@archipa/icl/dist/core/ast/base/baseNode';
import { RangeComparison } from '../core/enums/rangeComparison';
import { ASTNodeType } from '@archipa/icl/dist/core/enums/astNodeType';
import { ASTNodeKind } from '@archipa/icl/dist/core/enums/astNodeKind';
import * as Util from 'util';
import { ArrayExpression } from '@archipa/icl/dist/core/ast/base/arrayExpression';
import { Literal } from '@archipa/icl/dist/core/ast/base/literal';
import { Identifier } from '@archipa/icl/dist/core/ast/base/identifier';
import { PropertyDeclarator } from '@archipa/icl/dist/core/ast/declaration/settings/propertyDeclarator';
import { SettingsBlockDeclaration } from '@archipa/icl/dist/core/ast/declaration/settings/settingsBlockDeclaration';
import { UriUtils } from '../utils/uriUtils';
import { ConfigurationFile } from '@archipa/icl/dist/core/ast/configurationFile';
import { Inheritance } from '@archipa/icl/dist/core/ast/declaration/settings/inheritance';
import { CompilationOutput } from '../core/types/compile';
import { JSONPathExpression } from '@archipa/icl/dist/core/ast/base/jsonPathExpression';


export class HoverFeature implements IHoverFeature<IFeaturesRegistrator> {

    private static readonly BlockTypeTemplate = '(Block %s) %s';// (Block Type) block_type_name
    private static readonly PropertyReferenceTemplate = '(Property Reference) %s';
    private static readonly BlockReferenceTemplate = '(Block Reference) %s';
    private static readonly BlockInheritanceTemplate = '%s';
    private static readonly BlockInheritFromTemplate = 'Inherit from %s';
    private static readonly BlockNamespaceTemplate = '(Namespace) %s';
    private static readonly BlockAliasTemplate = '(Alias definition) %s';
    private static readonly PropertyTemplate = '(Property) %s';
    //private static readonly BlockPropertyNamespace = '(Path)';
    private readonly registrator: IFeaturesRegistrator;

    constructor(registrator: IFeaturesRegistrator) {
        this.registrator = registrator;
    }

    public onHover(document: vsServer.TextDocument, position: vsServer.Position): Thenable<vsServer.Hover> {

        return new Promise<vsServer.Hover>((resolve, reject) => {
            try {
                // look for the elements which is in documentInfo.position
                let wordLocation = DocumentUtils.getElementAtPosition(document, position, NoMatchAtCursorBehaviour.Stop);
                // attempt to retrieve the corresponding block in the AST
                let resource = this.registrator.getResource(UriUtils.getFilePath(document.uri), document.getText());
                let lastCompilationOutput = this.registrator.getLastCompile(resource);
                let lookupNode = DocumentUtils.searchForASTNode(resource.parsedContent, wordLocation);

                resolve(<vsServer.Hover>{
                    contents: this.formatMessage(wordLocation, lookupNode, <CompilationOutput>lastCompilationOutput),
                    range: vsServer.Range.create(wordLocation.range.start, wordLocation.range.end)
                });
            } catch (e) {
                resolve(<vsServer.Hover>{ contents: [] });
            }
        });
    }

    public selfRegister(): void {
        this.registrator.connection.onHover((documentInfo): Thenable<vsServer.Hover> => {
            return this.onHover(this.registrator.documents.get(documentInfo.textDocument.uri), documentInfo.position);
        });
    }

    private formatMessage(wordLocation: WordLocation,
        node: { match: BaseNode, type: RangeComparison } | undefined,
        lastCompilationOutput: CompilationOutput): Array<vsServer.MarkedString> {

        let info: Array<vsServer.MarkedString> = [];

        if (node) {
            switch (node.match.kind) {
                // type, alias
                case ASTNodeKind.Type:
                    info.push({
                        language: 'icl',
                        value: Util.format(HoverFeature.BlockTypeTemplate,
                            ASTNodeKind[node.match.kind],
                            wordLocation.word)
                    });
                    break;
                case ASTNodeKind.Alias:
                    info.push({
                        language: 'icl',
                        value: Util.format(HoverFeature.BlockTypeTemplate,
                            ASTNodeKind[node.match.kind],
                            wordLocation.word)
                    });
                    if ((<Identifier>node.match).name in lastCompilationOutput.aliases) {
                        // add source definition
                        info.push({
                            language: 'icl',
                            value: lastCompilationOutput.aliases[(<Identifier>node.match).name].bundle.toString()
                        });
                    }
                    break;
                // namespace
                case ASTNodeKind.Namespace:
                    info.push({
                        language: 'icl',
                        value: Util.format(HoverFeature.BlockNamespaceTemplate,
                            HoverFeature.joinArrayExpression(<ArrayExpression<Literal<string>>>node.match))
                    });
                    break;
                // aliased block
                case ASTNodeKind.AliasDefinition:
                    info.push({
                        language: 'icl',
                        value: Util.format(HoverFeature.BlockAliasTemplate,
                            (<Identifier>node.match).data)
                    });
                    break;
                // settings block property 
                case ASTNodeKind.Property:
                    info.push({
                        language: 'icl',
                        value: Util.format(HoverFeature.PropertyTemplate,
                            (<Identifier>node.match).name)
                    });
                    if (node.match.kind == ASTNodeKind.Property) {
                        let parentSettingsBlock = node.match.parent;
                        let searchedPropertyName = wordLocation.word;
                        while (parentSettingsBlock && parentSettingsBlock.type !== ASTNodeType.SettingsBlockDeclaration) {
                            parentSettingsBlock = parentSettingsBlock.parent;
                        }
                        if (parentSettingsBlock) {
                            let resolvedNode;
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
                            if (resolvedNode) {
                                // get associated comment 
                                let jsDoc = this.getComment(resolvedNode);
                                if (jsDoc) {
                                    info.push(jsDoc);
                                }
                            }
                        }
                    }
                    break;

                default:
                    let resolvedNode;
                    switch (node.match.type) {
                        case ASTNodeType.JSONPathExpression:
                            resolvedNode = DocumentUtils.evaluateJSPathExpression((<JSONPathExpression>node.match).expression, lastCompilationOutput);
                            if (resolvedNode) {
                                if (resolvedNode instanceof PropertyDeclarator) {
                                    info.push({
                                        language: 'icl',
                                        value: Util.format(HoverFeature.PropertyReferenceTemplate,
                                            resolvedNode.toString()
                                        )
                                    });
                                } else if (resolvedNode instanceof SettingsBlockDeclaration) {
                                    info.push({
                                        language: 'icl',
                                        value: Util.format(HoverFeature.BlockReferenceTemplate,
                                            resolvedNode.toString())
                                    });
                                }
                                // try to find the comment declared just before
                                let jsDoc = this.getComment(resolvedNode);
                                if (info) {
                                    info.push(<vsServer.MarkedString>jsDoc);
                                }
                            }
                            break;
                        case ASTNodeType.SettingsBlockInheritance:
                            
                            if ((<Inheritance>node.match).isAlias()) {
                                // add source definition
                                resolvedNode = lastCompilationOutput.aliases[(<Inheritance>node.match).data];                                
                            } else {
                                resolvedNode = DocumentUtils.evaluateJSPathExpression((<Inheritance>node.match).data, lastCompilationOutput);                                
                            }   
                            
                            info.push({
                                language: 'icl',
                                value: Util.format(HoverFeature.BlockInheritFromTemplate,
                                    (<Inheritance>node.match).data)
                            });

                            if (resolvedNode) {
                                if (resolvedNode instanceof SettingsBlockDeclaration) {
                                    info.push({
                                        language: 'icl',
                                        value: Util.format(HoverFeature.BlockInheritanceTemplate,
                                            resolvedNode.toString())
                                    });
                                }
                                // try to find the comment declared just before
                                let jsDoc = this.getComment(resolvedNode);
                                if (info) {
                                    info.push(<vsServer.MarkedString>jsDoc);
                                }
                            }
                            break;
                    }
                    break;
            }

            return info;
        }
        return info;
    }

    /**
     * get the comment attached with the current AST Node 
     * @param node 
     */
    private getComment(node: BaseNode): vsServer.MarkedString | undefined {

        let jsDoc = DocumentUtils.getAttachedJSDoc(node, this.registrator.getResource(node.loc.file_uri));

        if (jsDoc && jsDoc.length > 0) {
            return {
                language: 'js',
                value: jsDoc
            }
        } else {
            return undefined;
        }
    }

    /**
     * Take an array expression and join it's element exactly like Array.Join Method
     * @param arrExpression 
     */
    private static joinArrayExpression(arrExpression: ArrayExpression<Literal<string>>) {
        let arr: Array<string> = [];
        for (let element of arrExpression.elements) {
            arr.push(Util.format('%s', element.data));
        }
        return arr.join('.');
    }

}