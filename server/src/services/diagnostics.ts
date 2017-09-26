import { LexYaccError } from '@archipa/icl/dist/core/types/analysis';
import * as Util from 'util';

export class Diagnostics {

    private static KeywordToSymbols: Map<string, string> = new Map([
        ['EOF', 'end of file'],
        ['IDENTIFIER', 'identifier'],
        ['IMPORT_SEPARATOR', ','],
        ['COMMA_SEPARATOR', ','],
        ['BLOCK_VALUE_COMPLEX_END', '}'],
        ['BLOCK_VALUE_COMPLEX_START', '{'],
        ['CLOSE_BRACKET', '['],
        ['OPEN_BRACKET', ']'],
        ['TAKE_DECLARATION', 'take'],
        ['BLOCK_VALUE_PRIMITIVE', 'primitive'],
        ['ASCII_STRING', 'string'],
        ['FROM', 'from keyword'],
        ['APPLY', 'apply keyword'],
        ['TABLE', 'table keyword'],
        ['AS', 'as keyword'],
        ['PARAM', 'parameter'],
        ['FILE_NAME', 'file name'],
        ['PARENT_BLOCK', 'inheritance'],
        ['PARAM_PREFIX', '@'],
        ['EQUAL_OPERATOR', '='],
        ['INVALID', 'invalid token']
    ]);

    public static humanReadableError(error: LexYaccError): string {
        let output = '';
        if (error.hash && error.hash.expected) {
            output = Util.format('Expecting %s but found %s', error.hash.expected.map((message) => {
                message = message.replace(/'/gmi, '');
                return Diagnostics.KeywordToSymbols.has(message)
                    ? '"' + Diagnostics.KeywordToSymbols.get(message) + '"'
                    : message;
            }).join(' or '), Diagnostics.KeywordToSymbols.has(error.hash.token)
                    ? Diagnostics.KeywordToSymbols.get(error.hash.token)
                    : error.hash.token);
        } else {
            output = error.message;
        }
        return output;
    }

}