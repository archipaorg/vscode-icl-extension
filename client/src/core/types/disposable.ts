import * as vs from 'vscode';

export abstract class Disposable implements vs.Disposable {

    private readonly _disposables: Array<vs.Disposable>;

    constructor() {
        this._disposables = [];
    }

    /**
     * return all the disposable components
     * that had been registred before with {@see markAsDisposable}
     */
    public get disposables(): Array<vs.Disposable> {
        return this._disposables;
    }

    public dispose() {
        for (let disposable of this._disposables) {
            disposable.dispose();
            disposable = null;
        }
    }

    protected markAsDisposable(component: vs.Disposable): void {
        this._disposables.push(component);
    }
}