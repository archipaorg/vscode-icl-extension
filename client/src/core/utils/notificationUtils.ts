import * as vs from 'vscode';


export class NotificationUtils {

    public static noActiveWindow = () => {
        vs.window.showErrorMessage('Can\'t open ICL preview because there is no active window');
    }

    public static documentNotICL = (languageId) => {
        vs.window.showErrorMessage(`Can't generate ICL document preview for document with language id '${languageId}'`);
    }

    public static couldNotRenderICL = (reason) => {
        vs.window.showErrorMessage(`Error: Could not render ICL document; ${reason}`);
    }

    public static iclCommandNotOnPath = () => {
        vs.window.showErrorMessage(`Error: could not find 'icl.preview' command on path`);
    }

    public static iclCommandIsNull = () => {
        vs.window.showErrorMessage(`Error: 'icl.executablePath' must be set in vscode settings`);
    }
}