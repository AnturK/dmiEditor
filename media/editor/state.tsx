import {
    FromWebviewMessage,
    MessageHandler,
    MessageType,
    ReadyResponseMessage,
    ToWebviewMessage
} from "../../shared/messaging";

declare function acquireVsCodeApi(): {
    postMessage(msg: unknown): void;
    getState(): any;
    setState(value: any): void;
};

export const vscode = acquireVsCodeApi();

type SessionData = {
    zoom?: number | undefined;
    openStateId?: number | null | undefined;
};

class SessionState implements SessionData {
    zoom: number | undefined;
    openStateId: number | null | undefined;

    constructor() {
        const state = vscode.getState() as SessionData;
        this.zoom = state?.zoom;
        this.openStateId = state?.openStateId;
    }

    setZoom(value: number) {
        this.zoom = value;
        vscode.setState(this);
    }

    setOpenStateId(value: number | null) {
        this.openStateId = value;
        vscode.setState(this);
    }
}

export const sessionPersistentData = new SessionState();

const handles: {
    [T in ToWebviewMessage["type"]]?: (
        message: ToWebviewMessage
    ) => Promise<FromWebviewMessage> | undefined;
} = {};

export const registerHandler = <T extends ToWebviewMessage["type"]>(
    typ: T,
    handler: (msg: ToWebviewMessage & { type: T }) => Promise<FromWebviewMessage> | void
): void => {
    handles[typ] = handler as any;
};

export const messageHandler = new MessageHandler<FromWebviewMessage, ToWebviewMessage>(
    async msg => handles[msg.type]?.(msg),
    msg => vscode.postMessage(msg)
);

window.addEventListener("message", ev => messageHandler.handleMessage(ev.data));
