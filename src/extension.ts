import * as vscode from 'vscode';
import { DmiEditorProvider } from './dmiEditor';

export function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(DmiEditorProvider.register(context));
}