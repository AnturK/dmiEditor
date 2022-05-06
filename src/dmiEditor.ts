import * as vscode from 'vscode';
import { Dmi } from '../shared/dmi';
import { ExtensionHostMessageHandler, FromWebviewMessage, MessageHandler, MessageType, ToWebviewMessage } from '../shared/messaging';
import { Disposable, disposeAll } from './dispose';
import { getNonce } from './util';

class DmiDocument extends Disposable implements vscode.CustomDocument {

	static async create(
		uri: vscode.Uri,
		backupId: string | undefined
	): Promise<DmiDocument | PromiseLike<DmiDocument>> {
		// If we have a backup, read that. Otherwise read the resource from the workspace
		const dataFile = typeof backupId === 'string' ? vscode.Uri.parse(backupId) : uri;
		const fileData = await DmiDocument.readFile(dataFile);
		return new DmiDocument(uri, fileData);
	}

	private static async readFile(uri: vscode.Uri): Promise<Uint8Array> {
		if (uri.scheme === 'untitled') {
			return new Uint8Array();
		}
		return vscode.workspace.fs.readFile(uri);
	}

	private readonly _uri: vscode.Uri;

	private _dmi!: Dmi;

	private constructor(
		uri: vscode.Uri,
		initialContent: Uint8Array
	) {
		super();
		this._uri = uri;
		this.loadDmi(initialContent);
	}

	private async loadDmi(data: Uint8Array){
		this._dmi = await Dmi.parse(data);
	}

	public get uri() { return this._uri; }

	public get dmi() { return this._dmi; }

	private readonly _onDidDispose = this._register(new vscode.EventEmitter<void>());
	/**
	 * Fired when the document is disposed of.
	 */
	public readonly onDidDispose = this._onDidDispose.event;


	private readonly _onDidChange = this._register(new vscode.EventEmitter<{
		readonly label: string,
		readonly updateWebviews: boolean,
		undo(): void,
		redo(): void,
	}>());
	public readonly onDidChange = this._onDidChange.event;

	private readonly _onWebviewDesynchronized = this._register(new vscode.EventEmitter<{ readonly info: string}>());
	public readonly onWebviewDesynchronized = this._onWebviewDesynchronized.event;



	/**
	 * Called by VS Code when there are no more references to the document.
	 *
	 * This happens when all editors for it have been closed.
	 */
	dispose(): void {
		this._onDidDispose.fire();
		super.dispose();
	}

	/**
	 * Called when the user edits the document in a webview.
	 *
	 * This fires an event to notify VS Code that the document has been edited.
	 */
	async makeEdit(edit: string, updateWebviews: boolean) {
		//this._edits.push(edit);
		const previous_dmi = this.dmi;
		const edited_dmi = await Dmi.deserialize(edit);
		this._dmi = edited_dmi;

		this._onDidChange.fire({
			label: 'Edit',
			updateWebviews: updateWebviews,
			undo: async () => {
				this._dmi = previous_dmi;
				this.updateWebviews();
			},
			redo: async () => {
				this._dmi = edited_dmi;
				this.updateWebviews();
			}
		});
	}

	updateWebviews() {
		this._onWebviewDesynchronized.fire({info: "updateWebviews"});
	}

	/**
	 * Called by VS Code when the user saves the document.
	 */
	async save(cancellation: vscode.CancellationToken): Promise<void> {
		await this.saveAs(this.uri, cancellation);
	}

	/**
	 * Called by VS Code when the user saves the document to a new location.
	 */
	async saveAs(targetResource: vscode.Uri, cancellation: vscode.CancellationToken): Promise<void> {
		const fileData = await this.dmi.getFileData();
		await vscode.workspace.fs.writeFile(targetResource, fileData);
	}

	/**
	 * Called by VS Code when the user calls `revert` on a document.
	 */
	async revert(_cancellation: vscode.CancellationToken): Promise<void> {
		const diskContent = await DmiDocument.readFile(this.uri);
		this.loadDmi(diskContent);
		this.updateWebviews();
	}

	/**
	 * Called by VS Code to backup the edited document.
	 *
	 * These backups are used to implement hot exit.
	 */
	async backup(destination: vscode.Uri, cancellation: vscode.CancellationToken): Promise<vscode.CustomDocumentBackup> {
		await this.saveAs(destination, cancellation);

		return {
			id: destination.toString(),
			delete: async () => {
				try {
					await vscode.workspace.fs.delete(destination);
				} catch {
					// noop
				}
			}
		};
	}
}

export class DmiEditorProvider implements vscode.CustomEditorProvider<DmiDocument> {

	//part of temp name for new empty dmis
	private static newDmiFileId = 1;

	public static register(context: vscode.ExtensionContext): vscode.Disposable {
		/// Command to create new empty DMI
		vscode.commands.registerCommand('dmiEditor.dmiEditor.new', () => {
			const workspaceFolders = vscode.workspace.workspaceFolders;
			if (!workspaceFolders) {
				vscode.window.showErrorMessage("Creating new files currently requires opening a workspace");
				return;
			}

			const uri = vscode.Uri.joinPath(workspaceFolders[0].uri, `new-${DmiEditorProvider.newDmiFileId++}.dmi`)
				.with({ scheme: 'untitled' });

			vscode.commands.executeCommand('vscode.openWith', uri, DmiEditorProvider.viewType);
		});
		/// Editor provider
		return vscode.window.registerCustomEditorProvider(
			DmiEditorProvider.viewType,
			new DmiEditorProvider(context),
			{
				supportsMultipleEditorsPerDocument: false,
			});
	}

	private static readonly viewType = 'dmiEditor.dmiEditor';

	/**
	 * Tracks all known webviews
	 */
	private readonly webviews = new WebviewCollection();

	constructor(
		private readonly _context: vscode.ExtensionContext
	) { }

	//#region CustomEditorProvider

	async openCustomDocument(
		uri: vscode.Uri,
		openContext: { backupId?: string },
		_token: vscode.CancellationToken
	): Promise<DmiDocument> {
		const document: DmiDocument = await DmiDocument.create(uri, openContext.backupId);

		const listeners: vscode.Disposable[] = [];

		listeners.push(document.onDidChange(e => {
			// Tell VS Code that the document has been edited by the user.
			this._onDidChangeCustomDocument.fire({
				document,
				...e,
			});}));

		listeners.push(document.onWebviewDesynchronized(e => {
			// Update all webviews when the document changes
			for (const entry of this.webviews.get(document.uri)) {
				const [_webview, messageHandler] = entry;
				messageHandler.sendEvent({type:MessageType.DocumentChangedEvent, serialized_dmi: document.dmi.serialize()});
			}
		}));

		document.onDidDispose(() => disposeAll(listeners));

		return document;
	}

	async resolveCustomEditor(
		document: DmiDocument,
		webviewPanel: vscode.WebviewPanel,
		_token: vscode.CancellationToken
	): Promise<void> {
		const messageHandler: ExtensionHostMessageHandler = new MessageHandler(
			message => this.onMessage(messageHandler, document, message),
			message => webviewPanel.webview.postMessage(message),
		);

		// Add the webview to our internal set of active webviews
		this.webviews.add(document.uri, messageHandler, webviewPanel);

		// Setup initial content for the webview
		webviewPanel.webview.options = {
			enableScripts: true,
		};
		webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview);

		webviewPanel.webview.onDidReceiveMessage(e => messageHandler.handleMessage(e));
	}

	private async onMessage(
		messaging: ExtensionHostMessageHandler,
		document: DmiDocument,
		message: FromWebviewMessage,
	): Promise<undefined | ToWebviewMessage> {
		switch (message.type) {
			// If it's a packet request
			case MessageType.ReadyRequest:
				return {
					type: MessageType.ReadyResponse,
					serialized_dmi: document.dmi.serialize(),
					defaultZoom: vscode.workspace.getConfiguration('dmiEditor').get('defaultZoom') || 2
				};
			case MessageType.EditEvent:
				await document.makeEdit(message.edited_dmi, false);
				break;
		}
	}

	private readonly _onDidChangeCustomDocument = new vscode.EventEmitter<vscode.CustomDocumentEditEvent<DmiDocument>>();
	public readonly onDidChangeCustomDocument = this._onDidChangeCustomDocument.event;

	public saveCustomDocument(document: DmiDocument, cancellation: vscode.CancellationToken): Thenable<void> {
		return document.save(cancellation);
	}

	public saveCustomDocumentAs(document: DmiDocument, destination: vscode.Uri, cancellation: vscode.CancellationToken): Thenable<void> {
		return document.saveAs(destination, cancellation);
	}

	public revertCustomDocument(document: DmiDocument, cancellation: vscode.CancellationToken): Thenable<void> {
		return document.revert(cancellation);
	}

	public backupCustomDocument(document: DmiDocument, context: vscode.CustomDocumentBackupContext, cancellation: vscode.CancellationToken): Thenable<vscode.CustomDocumentBackup> {
		return document.backup(context.destination, cancellation);
	}

	//#endregion

	/**
	 * Get the static HTML used for in our editor's webviews.
	 */
	private getHtmlForWebview(webview: vscode.Webview): string {
		// Convert the styles and scripts for the webview into webview URIs
		const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._context.extensionUri, "dist", "editor.js"));
		const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._context.extensionUri, "dist", "editor.css"));
		const codiconsUri = webview.asWebviewUri(vscode.Uri.joinPath(this._context.extensionUri, 'node_modules', '@vscode/codicons', 'dist', 'codicon.css'));

		// Use a nonce to whitelist which scripts can be run
		const nonce = getNonce();

		return /* html */`
			<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">
				<!--
				Use a content security policy to only allow loading images from https or from our extension directory,
				and only allow scripts that have a specific nonce.
				-->
				<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} blob: data:; font-src ${webview.cspSource}; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
				<link href="${styleUri}" rel="stylesheet" />
				<link href="${codiconsUri}" rel="stylesheet" />
				<script nonce="${nonce}" src="${scriptUri}" defer></script>
				<title>DMI Editor</title>
			</head>
			<body>
			</body>
			</html>`;
	}
}

/**
 * Tracks all webviews.
 */
class WebviewCollection {

	private readonly _webviews = new Set<{
		readonly resource: string;
		readonly messageHandler: ExtensionHostMessageHandler;
		readonly webviewPanel: vscode.WebviewPanel;
	}>();

	/**
	 * Get all known webviews for a given uri.
	 */
	public *get(uri: vscode.Uri): Iterable<[vscode.WebviewPanel, ExtensionHostMessageHandler]> {
		const key = uri.toString();
		for (const entry of this._webviews) {
			if (entry.resource === key) {
				yield [entry.webviewPanel, entry.messageHandler];
			}
		}
	}

	/**
	 * Add a new webview to the collection.
	 */
	public add(uri: vscode.Uri, messageHandler: ExtensionHostMessageHandler, webviewPanel: vscode.WebviewPanel) {
		const entry = { resource: uri.toString(),messageHandler, webviewPanel };
		this._webviews.add(entry);

		webviewPanel.onDidDispose(() => {
			this._webviews.delete(entry);
		});
	}
}

