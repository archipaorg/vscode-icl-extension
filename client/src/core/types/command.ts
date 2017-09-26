import * as vs from 'vscode';
import { Disposable } from './disposable';


export abstract class VsCommand<T extends VsCommandRegistrator> extends Disposable {

    protected readonly registrator;
    // unique identifier of the command e.g. icl.previewToSide
    public readonly id: string;

    constructor(registrator: T) {
        super();
        this.registrator = registrator;
    }

    // the function called when the command gets executed
    public abstract exec(): Thenable<void>
}


export abstract class VsCommandRegistrator extends Disposable {

    constructor() {
        super();
        this.registerAllCommands();
    }

    /**
     * register all commands
     */
    public registerAllCommands() {
        for (let vsCommand of this.getCommandsList()) {
            let commandInstance = new vsCommand(this);
            vs.commands.registerCommand(commandInstance.id, commandInstance.exec, commandInstance);
            this.markAsDisposable(commandInstance);
        }
    }

    /**
     * returns the list of commands that need to be registred
     */
    public abstract getCommandsList(): (new (registrator: VsCommandRegistrator) => VsCommand<VsCommandRegistrator>)[];
}
