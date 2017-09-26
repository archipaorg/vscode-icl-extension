'use strict';

import * as vsClient from 'vscode-languageclient';
import * as path from 'path';
import * as vs from 'vscode';

import { ICLClient } from './iclClient';
import { ContentPreview } from './commands/contentPreview';

export function activate(context: vs.ExtensionContext) {
	const serverModuleURI: string = context.asAbsolutePath(path.join('server/server/src', 'server.js'));
	// Push the disposable icl client to the context's subscriptions so that the
	// client can be deactivated on extension deactivation
	context.subscriptions.push(new ICLClient(serverModuleURI, true).start());// TODO disable debug mode !
}