import React, { useEffect, useState } from "react";
import * as ReactDOM from "react-dom/client";
import "./dmiEditor.css";
import * as select from "./state";
import { Dirs, Dmi, DmiState } from "../../shared/dmi";
import {
    DocumentChangedEventMessage,
    MessageType,
    ReadyResponseMessage
} from "../../shared/messaging";
import { VscodeButton, VscodeDivider, VscodeTextfield, VscodeIcon } from "@vscode-elements/react-elements";
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

    const [direction, setDirection] = useState(Dirs.SOUTH);
    const ROTATION_DIRECTIONS = [
        Dirs.SOUTH,
        Dirs.WEST,
        Dirs.NORTH,
        Dirs.EAST
    ];
    const cycleDirection = (counterclockwise: boolean) => {
        let index = ROTATION_DIRECTIONS.indexOf(direction);
        counterclockwise ? index-- : index++;
        if (index < 0)
            index = ROTATION_DIRECTIONS.length - 1;
        else if (index > ROTATION_DIRECTIONS.length - 1)
            index = 0;
        setDirection(ROTATION_DIRECTIONS[index]);
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
            <VscodeTextfield
                value={dmi.width.toString()}
                style={{width:'3em'}}
                name="width"
                onChange={e => changeWidth((e.target as HTMLInputElement).value)}
            />
            <div>Height</div>
            <VscodeTextfield
                value={dmi.height.toString()}
                style={{width:'3em'}}
                name="height"
                onChange={e => changeHeight((e.target as HTMLInputElement).value)}
            />
        </>
    );

    const zoomDisplay = (
        <div>
            <VscodeButton icon="zoom-in" onClick={() => saveZoom(zoom + 1)}/>
            <VscodeButton icon="zoom-out" onClick={() => saveZoom(Math.max(1, zoom - 1))}/>
        </div>
    );

    const backgroundDisplayButton = (<VscodeButton icon="color-mode" onClick={toggleBackground} />);

    const dirDisplay = (
        <div>
            <VscodeButton icon="debug-step-back" onClick={() => cycleDirection(true)}/>
            <VscodeButton icon="debug-step-over" onClick={() => cycleDirection(false)}/>
        </div>
    );
    const infoBarElements = [sizeDisplay, zoomDisplay, backgroundDisplayButton];

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
            <VscodeButton onClick={() => setOpenStateIndex(null)}>Close</VscodeButton>
        );
    } else {
        mainContent = (
            <StateList
                filterString={searchText}
                dmi={dmi}
                direction={direction}
                pushUpdate={pushDmiUpdate}
                onOpen={state => setOpenStateIndex(dmi.states.findIndex(x => x === state))}
            />
        );
        // Direction buttons
        infoBarElements.push(dirDisplay);
        //Search bar
        infoBarElements.push(
            <VscodeTextfield
                value={searchText}
                onInput={e => setSearchText((e.target as HTMLInputElement).value)}
            >
                <VscodeIcon slot="content-before" name="search" title="search"></VscodeIcon>
            </VscodeTextfield>
        );
    }

    return (
        <div className="editor" style={dynamicStyle} onContextMenu={e => e.preventDefault()}>
            <div className="infoBar">
                {infoBarElements.map((e,i) => (
                    <div key={`info${i}`} className="infoBarSection">{e}</div>
                ))}
            </div>
            <VscodeDivider />
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
