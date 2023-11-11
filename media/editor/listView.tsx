import { VSCodeButton } from "@vscode/webview-ui-toolkit/react";
import React, { useState } from "react";
import { DmiState, Dirs, Dmi } from "../../shared/dmi";
import { EditableField } from "./components";
import { buildClassName, useGlobalHandler } from "./useHelpers";
import Image from "image-js";
import { messageHandler } from "./state";
import { MessageType } from "../../shared/messaging";

type ListStateDisplayProps = {
    state: DmiState;
    selected: boolean;
    hidden: boolean;
    duplicate: boolean;
    delete: () => void;
    select: () => void;
    open: () => void;
    modify: (modified_state: DmiState) => void;
};

// icon state preview on the state list
const ListStateDisplay: React.FC<ListStateDisplayProps> = props => {
    const iconState = props.state;
    const listClassName = buildClassName({
        statePreviewBox: true,
        selected: props.selected
    });
    const displayedName = `${iconState.name || "no name"}${iconState.movement ? "[M]" : ""}`;
    const nameFieldClass = buildClassName({
        stateName: true,
        noname: !iconState.name
    });

    const handleClick = () => {
        props.select();
    };

    const updateName = (value: string) => {
        const new_state = props.state.clone();
        new_state.name = value;
        props.modify(new_state);
    };

    return (
        <div className={listClassName} onClick={handleClick} hidden={props.hidden}>
            <EditableField
                value={iconState.name}
                displayValue={displayedName}
                onChange={updateName}
                className={nameFieldClass}
            />
            {props.duplicate && <div className="duplicate">Duplicate</div>}
            <div className="statePreview" onDoubleClick={props.open}>
                <img className="frame" src={iconState.generate_preview(Dirs.SOUTH)} />
            </div>
        </div>
    );
};

type StateListProps = {
    dmi: Dmi;
    filterString: string;
    pushUpdate: (newDmi: Dmi) => void;
    onOpen: (state: DmiState) => void;
};

export const StateList: React.FC<StateListProps> = props => {
    const [selectedState, setSelectedState] = useState<number | null>(null);
    const dmi = props.dmi;

    const delete_state = (state_index: number) => () => {
        const new_dmi = dmi.clone();
        new_dmi.states.splice(state_index, 1);
        props.pushUpdate(new_dmi);
    };

    const modify_state = (state_index: number) => (modified_state: DmiState) => {
        const new_dmi = dmi.clone();
        new_dmi.states[state_index] = modified_state;
        props.pushUpdate(new_dmi);
    };

    const addFreshState = (image?: Image, state_name?: string) => {
        const new_dmi = dmi.clone();
        const new_state = new DmiState(state_name || "new state");
        const new_state_image = image || DmiState.empty_frame(new_dmi.width, new_dmi.height);
        new_state.frames.push(new_state_image);
        new_state.frames_encoded.push(new_state_image.toDataURL());
        new_dmi.states.push(new_state);
        props.pushUpdate(new_dmi);
    };

    const addState = (state: DmiState) => {
        const new_dmi = dmi.clone();
        new_dmi.states.push(state);
        props.pushUpdate(new_dmi);
    };

    ///We put this in front of encoded states in clipboard
    const clipboardHeader = "EncodedDmiStateHeaderIHateThis:";

    useGlobalHandler<ClipboardEvent>(
        "paste",
        async e => {
            e.preventDefault();

            /// First we check png files copypasted wholesale from system - ie windows file explorer copy on a some.png file because navigator.clipboard.read() just panics in this case.
            /// We do it first because rejected navigator.clipboard.read also clears this list. Don't ask why.
            const data = e.clipboardData!;
            const imagesFromFiles: Array<{ image: Image; name: string }> = [];
            const raw_clipboard_errors = [];
            for (let index = 0; index < data.files.length; index++) {
                const file = data.files.item(index);
                if (file?.type !== "image/png") continue;
                const fileData = await file.arrayBuffer();
                const prospectiveState = await Image.load(fileData);
                if (prospectiveState.width == dmi.width && prospectiveState.height == dmi.height) {
                    imagesFromFiles.push({ image: prospectiveState, name: file.name });
                } else {
                    //Don't display errors here since these values might not be used at all
                    raw_clipboard_errors.push(
                        `Size of pasted image (${prospectiveState.width}x${prospectiveState.height}) does not match size of DMI (${dmi.width}x${dmi.height})`
                    );
                }
            }
            /// Next, actually try to read raw clipboard
            let clipboardContents: ClipboardItems;
            try {
                clipboardContents = await navigator.clipboard.read();
            } catch (error) {
                //It failed, possibly due to having these system copied files in there. Add them if any were found earlier.
                for (const found of imagesFromFiles) {
                    console.log(`Adddingfrom clipboardData.file`);
                    addFreshState(found.image, found.name);
                }
                for (const error_message of raw_clipboard_errors) {
                    // TODO: Just resize as needed
                    messageHandler.sendEvent({ type: MessageType.Alert, text: error_message });
                }
                return;
            }

            /// Now we actually have access to raw clipboard data so:
            const items_with_possible_serialized_states = clipboardContents.filter(x =>
                x.types.includes("text/plain")
            );
            const items_with_possible_raw_pngs = clipboardContents.filter(x =>
                x.types.includes("image/png")
            );
            let found_valid_serialized_states = false;
            for (const item of items_with_possible_serialized_states) {
                /// First let's check if we have a fully serialized state in there from our own copy
                console.log("Found text blob");
                const textBlob = await item.getType("text/plain");
                const clipboardText = await textBlob.text();
                if (clipboardText.startsWith(clipboardHeader)) {
                    const serializedData = clipboardText.slice(clipboardHeader.length);
                    const state = await DmiState.deserialize(JSON.parse(serializedData));
                    if (state.width == dmi.width && state.height == dmi.height) {
                        addState(state);
                    } else {
                        // TODO: Just resize as needed
                        messageHandler.sendEvent({
                            type: MessageType.Alert,
                            text: `Size of pasted state (${state.width}x${state.height}) does not match size of DMI (${dmi.width}x${dmi.height})`
                        });
                    }
                    found_valid_serialized_states = true;
                }
            }
            //We don't want to try to add png blobs since they always have less info than our direct data, they're just there for pasting into external editors
            if (found_valid_serialized_states) {
                return;
            }

            for (const item of items_with_possible_raw_pngs) {
                /// Next check if we have a png data blob
                const data = await item.getType("image/png");
                const ab = await data.arrayBuffer();
                const fileData = new Uint8Array(ab);
                try {
                    // These are usually just pngs, but in theory (according to chromium docs, but this might be different in electron/vscode) these can also have metadata so we try to parse as dmi
                    const dmi_or_png = await Dmi.parse(fileData);
                    if (dmi_or_png.width == dmi.width && dmi_or_png.height == dmi.height) {
                        for (const state of dmi_or_png.states) {
                            addState(state);
                        }
                    } else {
                        // TODO: Just resize as needed
                        messageHandler.sendEvent({
                            type: MessageType.Alert,
                            text: `Size of pasted raw image (${dmi_or_png.width}x${dmi_or_png.height}) does not match size of DMI (${dmi.width}x${dmi.height})`
                        });
                    }
                } catch (error) {
                    // Parse failed so it's some mangled metadata, just give up
                    return;
                }
            }
        },
        [dmi]
    );

    const copyToClipboard = async (e: ClipboardEvent) => {
        if (selectedState != null) {
            e.preventDefault();
            const state = dmi.states[selectedState];
            const serializedState = JSON.stringify(state.serialize());
            const prefixedSerializedState = `${clipboardHeader}${serializedState}`;
            const imageBlob = await state.buildComposite();
            const textBlob = new Blob([prefixedSerializedState], { type: "text/plain" });
            const item = new ClipboardItem({ "image/png": imageBlob, "text/plain": textBlob });
            navigator.clipboard.write([item]);
        }
    };

    useGlobalHandler<ClipboardEvent>("copy", e => copyToClipboard(e), [selectedState, dmi]);

    useGlobalHandler<ClipboardEvent>(
        "cut",
        async e => {
            if (selectedState != null) {
                e.preventDefault();
                copyToClipboard(e);
                delete_state(selectedState)();
            }
        },
        [selectedState, dmi]
    );

    useGlobalHandler<KeyboardEvent>(
        "keydown",
        e => {
            switch (e.code) {
                case "Delete":
                    if (selectedState !== null) {
                        if (document.activeElement?.nodeName == "VSCODE-TEXT-FIELD")
                            //move this to some context ?
                            break;
                        delete_state(selectedState)();
                    }
                    break;
            }
        },
        [selectedState, dmi]
    );

    return (
        <>
            <div className="stateList">
                {dmi.states.map((state, index) => (
                    <ListStateDisplay
                        key={index}
                        state={state}
                        modify={modify_state(index)}
                        delete={delete_state(index)}
                        select={() => setSelectedState(index)}
                        open={() => props.onOpen(state)}
                        selected={selectedState == index}
                        duplicate={
                            !!dmi.states.find(
                                other_state =>
                                    other_state != state &&
                                    other_state.name == state.name &&
                                    other_state.movement == state.movement
                            )
                        }
                        hidden={
                            props.filterString != "" && !state.name.includes(props.filterString)
                        }
                    />
                ))}
            </div>
            <VSCodeButton onClick={() => addFreshState()}>Add new state</VSCodeButton>
        </>
    );
};
