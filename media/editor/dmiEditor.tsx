import React, { useEffect, useState } from "react";
import * as ReactDOM from "react-dom/client";
import "./dmiEditor.css";
import * as select from "./state";
import { Dmi, DmiState } from "../../shared/dmi";
import {
    DocumentChangedEventMessage,
    MessageType,
    ReadyResponseMessage
} from "../../shared/messaging";
import { VSCodeButton, VSCodeDivider, VSCodeTextField } from "@vscode/webview-ui-toolkit/react";
import { StateDetailView } from "./detailView";
import { StateList } from "./listView";

enum BackgroundType {
    Default,
    Checkerboard
}

const Editor: React.FC = () => {
    const [dmi, setDmi] = useState<Dmi>(new Dmi(32, 32));

    const [zoom, setZoom] = useState(1);
    const saveZoom = (value: number) => {
        select.sessionPersistentData.setZoom(value);
        setZoom(value);
    };

    const [openStateIndex, setOpenStateIndexRaw] = useState<number | null>(null);
    const setOpenStateIndex = (value: number | null) => {
        select.sessionPersistentData.setOpenStateId(value);
        setOpenStateIndexRaw(value);
    };

    const [searchText, setSearchText] = useState("");

    const [backgroundType, setBackgroundType] = useState(BackgroundType.Default);

    const restoreSession = () => {
        if (select.sessionPersistentData.zoom !== undefined)
            setZoom(select.sessionPersistentData.zoom);
        if (select.sessionPersistentData.openStateId !== undefined)
            setOpenStateIndex(select.sessionPersistentData.openStateId);
    };

    useEffect(() => {
        // Fetch the initial dmi when ready
        const fetchDmi = async () => {
            const initial_dmi_data = await select.messageHandler.sendRequest<ReadyResponseMessage>({
                type: MessageType.ReadyRequest
            });
            const dmi = await Dmi.deserialize(initial_dmi_data.serialized_dmi);
            const defaultZoom = initial_dmi_data.defaultZoom;
            setZoom(defaultZoom);
            setDmi(dmi);
            restoreSession();
        };

        // Document was updated on vscode side, (redos/undos/reverts)
        const OnUpdateDocumentEventHandler = (msg: DocumentChangedEventMessage) => {
            const do_stuff = async () => {
                const new_dmi = await Dmi.deserialize(msg.serialized_dmi);
                setDmi(new_dmi);
            };
            do_stuff();
        };

        select.registerHandler(MessageType.DocumentChangedEvent, OnUpdateDocumentEventHandler);
        fetchDmi();
    }, []);

    const pushDmiUpdate = (new_dmi: Dmi) => {
        select.messageHandler.sendEvent({
            type: MessageType.EditEvent,
            edited_dmi: new_dmi.serialize()
        });
        setDmi(new_dmi);
    };

    const pushStateUpdate = (new_state: DmiState, index: number) => {
        const new_dmi = dmi.clone();
        new_dmi.states[index] = new_state;
        pushDmiUpdate(new_dmi);
    };

    const resize = (new_width: number, new_height: number) => {
        const new_dmi = dmi.clone();
        new_dmi.resize(new_width, new_height);
        pushDmiUpdate(new_dmi);
    };

    const changeWidth = (new_width: string) => {
        const parsedWidth = parseInt(new_width);
        if (isNaN(parsedWidth) || parsedWidth <= 0) return;
        resize(parsedWidth, dmi.height);
    };

    const changeHeight = (new_width: string) => {
        const parsedHeight = parseInt(new_width);
        if (isNaN(parsedHeight) || parsedHeight <= 0) return;
        resize(dmi.width, parsedHeight);
    };

    //Turn off default context menu
    //useGlobalHandler<MouseEvent>("contextmenu", e => {e.preventDefault();},[]);

    const getBackgroundCSS = (bgType: BackgroundType) => {
        switch (bgType) {
            case BackgroundType.Default:
                return "inherit";
            case BackgroundType.Checkerboard:
                return "repeating-conic-gradient(gray 0% 25%, white 0% 50%) 50% / 20px 20px";
        }
    };

    const toggleBackground = () => {
        const order = [BackgroundType.Default, BackgroundType.Checkerboard];
        setBackgroundType(order[(order.findIndex(x => x === backgroundType) + 1) % order.length]);
    };

    const dynamicStyle = {
        "--dmiHeight": `${dmi.height}px`,
        "--dmiWidth": `${dmi.width}px`,
        "--zoomFactor": zoom,
        "--zoomedDmiHeight": `${dmi.height * zoom}px`,
        "--zoomedDmiWidth": `${dmi.width * zoom}px`,
        "--frameBackground": getBackgroundCSS(backgroundType)
    } as React.CSSProperties; //I don't get why the type is so restrictive here

    const sizeDisplay = (
        <>
            <div>Width</div>
            <VSCodeTextField
                value={dmi.width.toString()}
                size={3}
                name="width"
                onChange={e => changeWidth((e.target as HTMLInputElement).value)}
            />
            <div>Height</div>
            <VSCodeTextField
                value={dmi.height.toString()}
                size={3}
                name="height"
                onChange={e => changeHeight((e.target as HTMLInputElement).value)}
            />
        </>
    );
    const zoomDisplay = (
        <div>
            <VSCodeButton appearance="icon" onClick={() => saveZoom(zoom + 1)}>
                <span className="codicon codicon-zoom-in" />
            </VSCodeButton>
            <VSCodeButton appearance="icon" onClick={() => saveZoom(Math.max(1, zoom - 1))}>
                <span className="codicon codicon-zoom-out" />
            </VSCodeButton>
        </div>
    );
    const backgroundDisplay = (
        <VSCodeButton appearance="icon" onClick={toggleBackground}>
            <span className="codicon codicon-color-mode" />
        </VSCodeButton>
    );
    const infoBarElements = [sizeDisplay, zoomDisplay, backgroundDisplay];

    let mainContent = null;
    if (openStateIndex != null) {
        mainContent = (
            <StateDetailView
                state={dmi.states[openStateIndex]}
                pushUpdate={state => pushStateUpdate(state, openStateIndex)}
            />
        );
        //Close state view button
        infoBarElements.push(
            <VSCodeButton onClick={() => setOpenStateIndex(null)}>Close</VSCodeButton>
        );
    } else {
        mainContent = (
            <StateList
                filterString={searchText}
                dmi={dmi}
                pushUpdate={pushDmiUpdate}
                onOpen={state => setOpenStateIndex(dmi.states.findIndex(x => x === state))}
            />
        );
        //Search bar
        infoBarElements.push(
            <VSCodeTextField
                value={searchText}
                onInput={e => setSearchText((e.target as HTMLInputElement).value)}
            >
                <span slot="start" className="codicon codicon-search"></span>
            </VSCodeTextField>
        );
    }

    return (
        <div className="editor" style={dynamicStyle} onContextMenu={e => e.preventDefault()}>
            <div className="infoBar">
                {infoBarElements.map(e => (
                    <div className="infoBarSection">{e}</div>
                ))}
            </div>
            <VSCodeDivider />
            {mainContent}
        </div>
    );
};

const root = ReactDOM.createRoot(document.body);

root.render(
    <React.Suspense fallback={<div>Loading...</div>}>
        <Editor />
    </React.Suspense>
);
