import * as vsServer from 'vscode-languageserver';
import { BaseNode } from '@archipa/icl/dist/core/ast/base/baseNode';
import { Loc } from '@archipa/icl/dist/core/types/analysis';
import { Position } from 'vscode-languageserver';
import Uri from 'vscode-uri';
import { NoMatchAtCursorBehaviour } from '../core/enums/analysis';
import { RangeComparison } from '../core/enums/rangeComparison';

import { ConfigurationFile } from '@archipa/icl/dist/core/ast/configurationFile';
import { ArrayExpression } from '@archipa/icl/dist/core/ast/base/arrayExpression';
import { BinaryExpression } from '@archipa/icl/dist/core/ast/base/binaryExpression';
import { JSONPathExpression } from '@archipa/icl/dist/core/ast/base/jsonPathExpression';
import { SettingsBlockDeclaration } from '@archipa/icl/dist/core/ast/declaration/settings/settingsBlockDeclaration';
import { Bundle } from '@archipa/icl/dist/core/ast/declaration/settings/bundle';
import { ASTNodeKind } from '@archipa/icl/dist/core/enums/astNodeKind';
import { ASTNodeType } from '@archipa/icl/dist/core/enums/astNodeType';
import { PropertyDeclarator } from '@archipa/icl/dist/core/ast/declaration/settings/propertyDeclarator';
import * as objectPath from 'object-path';
import { Inheritance } from '@archipa/icl/dist/core/ast/declaration/settings/inheritance';
import { CompilationOutput } from '../core/types/compile';
import { ImportDeclaration } from '@archipa/icl/dist/core/ast/declaration/import/importDeclaration';
import { EditableResource } from '@archipa/icl/dist/compiler/resource/editableResource';

/**
 * Word at a known position (Range) in the document
 */
export class WordLocation {
    word: string;
    range: vsServer.Range;

    constructor(word: string, range: vsServer.Range) {
        this.word = word;
        this.range = range;
    }

    public get isEmpty(): boolean {
        return this.range.start.character === this.range.end.character && this.range.start.line === this.range.end.line;
    }
}

export class DocumentUtils {

    private static readonly COMMENT_REGEX = /((\/\*([^*]|[\r\n]|(\*+([^*\/]|[\r\n])))*\*+\/)|(\/\/.*))$|((#|\/\/).*?(\n|\$))$/gm;
    private static readonly PATH_SEPARATOR = '.';
    private static identifierSymbols = /[0-9a-zA-Z_'.\-":@]/g;
    private static allSymbols = /[0-9a-zA-Z_'.\-":=]/g;
    private static unauthorizedSymbols = /\n|\r|\s/g;

    /**
    * return text at position, where text is composed of identifier characters
    */
    public static getElementAtPosition(document: vsServer.TextDocument,
        position: Position,
        sticky: NoMatchAtCursorBehaviour, symbolChecker: (str: string) => boolean = DocumentUtils.isIdentifierSymbol): WordLocation {
        let text = document.getText();
        let cursorOffset = document.offsetAt(position);
        let startOffset = DocumentUtils.getStartingOffset(text, cursorOffset, symbolChecker, sticky);
        let endOffset = DocumentUtils.getEndingOffset(text, cursorOffset, symbolChecker, sticky);
        let word = text.slice(startOffset, endOffset + 1).replace(DocumentUtils.unauthorizedSymbols, '').trim(); //ending offset should be included
        return new WordLocation(word, vsServer.Range.create(document.positionAt(startOffset), document.positionAt(endOffset + 1)));
    }

    /**
     * Perform a recursive search to look for the deepest element that matches the current word
     * @param ast 
     * @param wordLocation 
     */
    public static getASTNodeFromWordLocation(rootNode: BaseNode, wordLocation: WordLocation, closest: boolean = false): { match: BaseNode, type: RangeComparison } | undefined {
        // check that the word is in the current node location
        let comparison: RangeComparison = DocumentUtils.compareRange(rootNode, wordLocation);
        let result: { match: BaseNode, type: RangeComparison } | undefined = undefined;

        if (comparison === RangeComparison.IN || comparison === RangeComparison.EXACT) {
            result = { match: rootNode, type: comparison };
            if (rootNode && DocumentUtils.isDataStructureNode(rootNode)) {
                for (let node of rootNode) {
                    if (node instanceof BaseNode) {
                        let subResult = DocumentUtils.getASTNodeFromWordLocation(node, wordLocation, closest);
                        if (subResult) {
                            result = subResult;
                        }
                    }
                }
            }
        }
        return result;
    }

    public static searchForASTNode(ast: BaseNode, wordLocation: WordLocation, closest: boolean = false): { match: BaseNode, type: RangeComparison } | undefined {
        let lookupNode = null;
        lookupNode = DocumentUtils.getASTNodeFromWordLocation(ast, wordLocation, closest);
        if (lookupNode && lookupNode.match) {
            // overwrite the word's ranges with the found node's one to be more precise
            wordLocation.range.start.line = lookupNode.match.loc.first_line - 1;
            wordLocation.range.start.character = lookupNode.match.loc.first_column;
            wordLocation.range.end.line = lookupNode.match.loc.last_line - 1;
            wordLocation.range.end.character = lookupNode.match.loc.last_column;
        }
        return lookupNode;
    }

    public static searchSettingsBlockDeclarationLike(asts: Array<BaseNode>, namespace: Array<string> = [], perfectMatch: boolean = false): Array<SettingsBlockDeclaration> {
        let arr: Array<SettingsBlockDeclaration> = [];
        for (let ast of asts) {
            arr = arr.concat(DocumentUtils.searchSettingsBlockDeclarationInAST(ast, namespace, perfectMatch));
        }
        return arr;
    }

    private static searchSettingsBlockDeclarationInAST(rootNode: BaseNode, namespace: Array<string>, perfectMatch: boolean) {

        let matches: Array<SettingsBlockDeclaration> = [];
        let namespaceDotNotated = namespace.filter((element) => { return element != ''; }).join('.').toLowerCase();
        if (rootNode instanceof SettingsBlockDeclaration) {
            if (namespace.length == 0
                || (
                    ((!perfectMatch && (<Array<string>>(<SettingsBlockDeclaration>rootNode).bundle.getJSONFullPath()).map((element) => {
                        return element.toLowerCase();
                    }).join('.').startsWith(namespaceDotNotated.replace(/:/g, '')))
                        ||
                        ((<Array<string>>(<SettingsBlockDeclaration>rootNode).bundle.getJSONFullPath()).map((element) => {
                            return element.toLowerCase();
                        }).join('.') == namespaceDotNotated.replace(/:/g, '')))
                    && (!namespaceDotNotated.startsWith(':') || namespaceDotNotated.startsWith(':') && (<SettingsBlockDeclaration>rootNode).bundle.isLib)
                )
            ) {
                matches.push(rootNode);
            }
            if ((<SettingsBlockDeclaration>rootNode).value) {
                for (let propertyDeclarator of (<SettingsBlockDeclaration>rootNode).value) {
                    if ((<PropertyDeclarator>propertyDeclarator).right instanceof SettingsBlockDeclaration) {
                        matches = matches.concat(DocumentUtils.searchSettingsBlockDeclarationInAST((<PropertyDeclarator>propertyDeclarator).right, namespace, perfectMatch));
                    }
                }
            }
        } else if (rootNode instanceof ArrayExpression) {
            for (let childNode of rootNode) {
                if (childNode) {
                    matches = matches.concat(DocumentUtils.searchSettingsBlockDeclarationInAST(childNode, namespace, perfectMatch));
                }
            }
        } else if (rootNode instanceof PropertyDeclarator) {
            matches = matches.concat(DocumentUtils.searchSettingsBlockDeclarationInAST((<PropertyDeclarator>rootNode).right, namespace, perfectMatch));
        }

        return matches;
    }

    public static getAllSettingsBlockFields(sbNode: SettingsBlockDeclaration, compilationOutput: CompilationOutput, inherited: boolean = false): Array<{ propertyDeclaration: PropertyDeclarator, inherited: boolean }> {

        let properties: Array<{ propertyDeclaration: PropertyDeclarator, inherited: boolean }> = [];

        for (let property of sbNode.value) {
            if (property instanceof PropertyDeclarator) {
                properties.push({
                    propertyDeclaration: property,
                    inherited: inherited
                });
            }
        }

        // loop through parents 
        if (sbNode.inheritFrom) {
            for (let inheritance of sbNode.inheritFrom.inheritances) {
                let parentSb = (<Inheritance>inheritance).isAlias()
                    ? [compilationOutput.aliases[(<Inheritance>inheritance).getPath()[0]]]
                    : DocumentUtils.searchSettingsBlockDeclarationLike(compilationOutput.ast, (<Inheritance>inheritance).getPath(), true);

                parentSb.forEach((sb) => {
                    properties = properties.concat(DocumentUtils.getAllSettingsBlockFields(sb, compilationOutput, true));
                });
            }
        }

        return properties;
    }

    public static getPreviousWord(document: vsServer.TextDocument, wordLocation: WordLocation): WordLocation {
        // compute the previous position in the global document
        let previousWordRange = vsServer.Range.create(wordLocation.range.start.line, wordLocation.range.start.character,
            wordLocation.range.end.line, wordLocation.range.end.character);
        if (previousWordRange.start.character == 0) {
            previousWordRange.start.line = previousWordRange.start.line > 0 ? previousWordRange.start.line - 1 : 0;
        }
        previousWordRange.start.character = previousWordRange.start.character > 0 ? previousWordRange.start.character - 1 : 0;
        // check what's behind the current word
        let previousWord = DocumentUtils.getElementAtPosition(document, previousWordRange.start, NoMatchAtCursorBehaviour.LookLeft, DocumentUtils.isSymbol);
        // also if the previous word range is the same as the current one, it means we are at the really begining of the file
        // which means we have nothing before
        if (previousWordRange.start.character == wordLocation.range.start.character
            && previousWordRange.start.line == wordLocation.range.start.line) {
            previousWord.word = '';
        }
        return previousWord;
    }

    public static isIdentifierSymbol(c: string): boolean {
        return c.search(DocumentUtils.identifierSymbols) !== -1;
    }

    public static isSymbol(c: string): boolean {
        return c.search(DocumentUtils.allSymbols) !== -1;
    }

    public static evaluateJSPathExpression(expression: string, lastCompilationOutput: CompilationOutput): PropertyDeclarator | SettingsBlockDeclaration | undefined {
        let resolvedNode = undefined;
        // search for corresponding block or property
        let searchedSettingsBlockNamespace = expression.split(DocumentUtils.PATH_SEPARATOR);
        let searchedPropertyNamespace = [];
        while (searchedSettingsBlockNamespace.length > 0 && !resolvedNode) {
            let settingsBlocksFound = DocumentUtils.searchSettingsBlockDeclarationLike(lastCompilationOutput.ast, searchedSettingsBlockNamespace, true);
            /**
             * We found our settings block
             * So now if the searchPropertyNamespace is filled it means our JSONExpression was resolving
             * to a property so we must find this property location
             */
            if (settingsBlocksFound.length > 0) {
                // get all settings block properties
                if (searchedPropertyNamespace.length > 0) {
                    // we were looking for a property
                    // get all sb properties
                    let allSettingsBlocksProperties = DocumentUtils.getAllSettingsBlockFields(settingsBlocksFound[0], lastCompilationOutput, true);
                    let matchedProperty;
                    for (let settingsBlockProperty of allSettingsBlocksProperties) {
                        let propertyName = settingsBlockProperty.propertyDeclaration.identifier.name
                            ? settingsBlockProperty.propertyDeclaration.identifier.name
                            : (<SettingsBlockDeclaration>settingsBlockProperty.propertyDeclaration.right).bundle.getJSONRelativePath(true);

                        if (searchedPropertyNamespace.join(DocumentUtils.PATH_SEPARATOR) == propertyName) {
                            matchedProperty = settingsBlockProperty.propertyDeclaration;
                            break;
                        }
                    }

                    if (matchedProperty) {
                        resolvedNode = matchedProperty;
                    }

                } else {
                    // we were looking for a settings block, so we take the first result
                    resolvedNode = settingsBlocksFound[0];
                }
            } else {
                // we add part of the full namespace into the property searched
                searchedPropertyNamespace.unshift(searchedSettingsBlockNamespace.pop());
            }
        }
        return resolvedNode;
    }

    /**
     * Returns the attached jsDoc comment of {@see node} 
     * @param node 
     * @param resource 
     */
    public static getAttachedJSDoc(node: BaseNode, resource: EditableResource<string, ConfigurationFile>): any | undefined {
        let jsDoc = undefined;
        if (node && resource) {
            // copy all text from 0 to node.loc.first_line
            let previousTextPortion = resource.content().split('\n').slice(0, node.loc.first_line - 1).join('\n').trim();
            // search for the previous comment 
            let match;
            while (match = DocumentUtils.COMMENT_REGEX.exec(previousTextPortion)) {
                // This is necessary to avoid infinite loops with zero-width matches                
                if (match.index === DocumentUtils.COMMENT_REGEX.lastIndex) {
                    DocumentUtils.COMMENT_REGEX.lastIndex++;
                }
                jsDoc = match[0];
            }

            if (jsDoc) {
                if (previousTextPortion.endsWith(jsDoc)) {
                    // normalize jsDoc comment by removing the enclosing tags
                    if (jsDoc.startsWith('/**')) {
                        jsDoc = jsDoc.replace('/**', '').replace('*/', '');
                    } else if (jsDoc.startsWith('//')) {
                        jsDoc = jsDoc.replace('//', '');
                    } else if (jsDoc.startsWith('#'), '') {
                        jsDoc = jsDoc.replace('#', '');
                    }
                    jsDoc = jsDoc.trim().split('\n').map((line) => {
                        return line.trim();
                    }).join('\n');
                } else {
                    jsDoc = '';
                }
            }
        }
        return jsDoc;
    }

    private static compareRange<T extends BaseNode>(outterNode: T, wordLocation: WordLocation): RangeComparison {
        if (wordLocation.range.start.line + 1 == outterNode.loc.first_line
            && wordLocation.range.end.line + 1 == outterNode.loc.last_line
            && wordLocation.range.start.character == outterNode.loc.first_column
            && wordLocation.range.end.character == outterNode.loc.last_column) { // exact match
            return RangeComparison.EXACT;
        } else if (
            ((
                wordLocation.range.start.line + 1 == outterNode.loc.first_line
                && wordLocation.range.start.character >= outterNode.loc.first_column
            ) ||
                (
                    wordLocation.range.start.line + 1 > outterNode.loc.first_line
                ))
            && (
                (wordLocation.range.end.line + 1 == outterNode.loc.last_line
                    && wordLocation.range.end.character <= outterNode.loc.last_column
                )
                ||
                (wordLocation.range.end.line + 1 < outterNode.loc.last_line)
            )
        ) { // in
            return RangeComparison.IN;
        } else {
            return RangeComparison.OUT;
        }
    }

    private static isDataStructureNode<T extends BaseNode>(node: T): boolean {
        return (node instanceof ArrayExpression && node.kind !== ASTNodeKind.Namespace)
            || node instanceof BinaryExpression
            || node instanceof SettingsBlockDeclaration
            || node instanceof Bundle
            || node instanceof ImportDeclaration;
    }

    private static getStartingOffset(text: string, cursorOffset: number, isValidSymbol: (str: string) => boolean, sticky: NoMatchAtCursorBehaviour): number {
        if (isValidSymbol(text.charAt(cursorOffset)) || sticky === NoMatchAtCursorBehaviour.LookLeft || sticky === NoMatchAtCursorBehaviour.LookBoth) {
            let i = cursorOffset - 1;
            while (i-- > 0 && isValidSymbol(text.charAt(i)));
            return i + 1;
        }
        else {
            return cursorOffset;
        }
    }

    private static getEndingOffset(text: string, cursorOffset: number, isValidSymbol: (str: string) => boolean, sticky: NoMatchAtCursorBehaviour): number {
        if (isValidSymbol(text.charAt(cursorOffset)) || sticky === NoMatchAtCursorBehaviour.LookRight || sticky === NoMatchAtCursorBehaviour.LookBoth) {
            let i = Math.max(0, cursorOffset);
            while (i++ < text.length && isValidSymbol(text.charAt(i)));
            return i - 1;
        }
        else {
            return cursorOffset;
        }
    }




}