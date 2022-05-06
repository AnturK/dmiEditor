import { VSCodeButton } from "@vscode/webview-ui-toolkit/react";
import React, { useState } from "react";
import { DmiState, Dirs, Dmi } from "../../shared/dmi";
import { EditableField } from "./components";
import { useGlobalHandler } from "./useHelpers";
import Image from 'image-js';

type ListStateDisplayProps = {
	state: DmiState;
	selected: boolean;
	hidden: boolean;
	delete: () => void;
	select: () => void;
	open: () => void;
	modify: (modified_state: DmiState) => void;
}

// icon state preview on the state list
const ListStateDisplay: React.FC<ListStateDisplayProps> = (props) => {
	const className = props.selected ? 'statePreviewBox selected' : 'statePreviewBox';
	const iconState = props.state;
	const handleClick = () => {
		props.select();
	};

	const updateName = (value : string) => {
		const new_state = props.state.clone();
		new_state.name = value;
		props.modify(new_state);
	};
	const displayedName = `${iconState.name}${iconState.movement ? "[M]" : ""}`;

	//<IconStateAnimation frames={[...Array(iconState.framecount)].map((_, index) => iconState.get_frame_encoded(index, Dirs.SOUTH))} delays={iconState.delays} />
	return (
		<div
			className={className}
			onClick={handleClick}
			hidden={props.hidden}
		>
			<EditableField value={iconState.name} displayValue={displayedName} onChange={updateName} className='stateName'/>
			<div className='statePreview' onDoubleClick={props.open}>
				<img className="frame" src={iconState.generate_preview(Dirs.SOUTH)}/>
			</div>
		</div>);
};

type StateListProps = {
	dmi: Dmi
	filterString: string;
	pushUpdate: (newDmi: Dmi) => void
	onOpen: (state: DmiState) => void;
};

export const StateList: React.FC<StateListProps> = (props) => {
	const [selectedState, setSelectedState] = useState<number | null>(null);
	const dmi = props.dmi;

	const delete_state = (state_index: number) => () => {
		const new_dmi = dmi.clone();
		new_dmi.states.splice(state_index,1);
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

	useGlobalHandler<ClipboardEvent>("paste", async (e) => {
		e.preventDefault();
		const data = e.clipboardData!;
		// handle 'image/png' files
		for (let index = 0; index < data.files.length; index++) {
			console.log("Iterating files");
			const file = data.files.item(index);
			if (file?.type !== 'image/png')
				continue;
			const fileData = await file.arrayBuffer();
			const prospectiveState = await Image.load(fileData);
			if (prospectiveState.width == dmi.width && prospectiveState.height == dmi.height) {
				addFreshState(prospectiveState, file.name);
			}
		}
		// Handle serialized full states
		const serialized_state = data.getData("dmi-state");
		if (serialized_state != "") {
			const state = await DmiState.deserialize(JSON.parse(serialized_state));
			addState(state);
		}
	}, [dmi]);

	useGlobalHandler<ClipboardEvent>("copy", (e) => {
		if (selectedState != null) {
			e.preventDefault();
			const state = dmi.states[selectedState];
			const serialized_state = JSON.stringify(state.serialize());
			e.clipboardData?.setData("dmi-state", serialized_state);
		}
	}, [selectedState, dmi]);


	useGlobalHandler<KeyboardEvent>("keydown", e => {
		switch(e.code){
			case "Delete":
				if(selectedState !== null){
					if(document.activeElement?.nodeName == 'VSCODE-TEXT-FIELD') //move this to some context ?
						break;
					delete_state(selectedState)();
				}
				break;
		}
	}, [selectedState,dmi]);

	return (<>
		<div className="stateList" >
			{dmi.states.map((state, index) =>
				<ListStateDisplay
					key={index}
					state={state}
					modify={modify_state(index)}
					delete={delete_state(index)}
					select={() => setSelectedState(index)}
					open={() => props.onOpen(state)}
					selected={selectedState == index}
					hidden={props.filterString != "" && !state.name.includes(props.filterString)}
				/>)}
		</div>
		<VSCodeButton onClick={() => addFreshState()}>Add new state</VSCodeButton>
	</>);
};