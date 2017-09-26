import * as vsServer from 'vscode-languageserver';
import Uri from 'vscode-uri';


export class UriUtils {

    /**
     * check if the doc is a real file
     * @param uri 
     */
    public static isFileProtocol(uri: string): boolean {
        return Uri.parse(uri).scheme == 'file';
    }

    /**
     * return the file path part
     * @param uri 
     */
    public static getFilePath(uri: string): string {
        return Uri.parse(uri).path;
    }

    /**
     * normalize file path by adding file protocol schema 
     * @param path 
     */
    public static normalizeFilePath(path: string): string {
        return (process.platform === 'win32' ? 'file:///' : 'file://') + path.replace(/\\/g, '/').split('/').map(encodeURIComponent).join('/');
    }

}