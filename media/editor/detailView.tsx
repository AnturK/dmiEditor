import React, { useState } from "react";
import { VSCodeTextField, VSCodeCheckbox, VSCodeDivider, VSCodeDropdown, VSCodeOption } from "@vscode/webview-ui-toolkit/react";
import { DmiState, Dirs, DirNames } from "../../shared/dmi";
import { EditableField } from "./components";
import { Image } from 'image-js';
import { useGlobalHandler } from "./useHelpers";

type StateDetailViewProps = {
	state: DmiState
	pushUpdate: (newState: DmiState) => void;
}

export const StateDetailView: React.FC<StateDetailViewProps> = (props) => {
	const state = props.state;

	const previewGrid = () => {
		switch (props.state.dirs) {
			case 1:
				return <div className='singleDirGrid'><img className="frame" src={state.generate_preview(Dirs.SOUTH)}/></div>;
			case 4:
				return (
					<div className='dirGrid'>
						<div></div>
						<div><img className="frame" src={state.generate_preview(Dirs.NORTH)}/></div>
						<div></div>
						<div><img className="frame" src={state.generate_preview(Dirs.WEST)}/></div>
						<div></div>
						<div><img className="frame" src={state.generate_preview(Dirs.EAST)}/></div>
						<div></div>
						<div><img className="frame" src={state.generate_preview(Dirs.SOUTH)}/></div>
						<div></div>
					</div>
				);
			case 8:
				return (
					<div className='dirGrid'>
						<div><img className="frame" src={state.generate_preview(Dirs.NORTHWEST)}/></div>
						<div><img className="frame" src={state.generate_preview(Dirs.NORTH)}/></div>
						<div><img className="frame" src={state.generate_preview(Dirs.NORTHEAST)}/></div>
						<div><img className="frame" src={state.generate_preview(Dirs.WEST)}/></div>
						<div></div>
						<div><img className="frame" src={state.generate_preview(Dirs.EAST)}/></div>
						<div><img className="frame" src={state.generate_preview(Dirs.SOUTHWEST)}/></div>
						<div><img className="frame" src={state.generate_preview(Dirs.SOUTH)}/></div>
						<div><img className="frame" src={state.generate_preview(Dirs.SOUTHEAST)}/></div>
					</div>
				);
		}
	};

	const dynamicStyle = {
		'--frameGridRows': `${state.dirs + 1}`,
		'--frameGridColumns': `${state.framecount + 1}`
	} as React.CSSProperties; //I don't get why the type is so restrictive here

	const filledDelays: number[] = state.delays.length ? state.delays : Array(state.framecount).fill(1);


	const updateName = (new_name: string) => {
		if(state.name == new_name)
			return;
		const new_state = state.clone();
		new_state.name = new_name;
		props.pushUpdate(new_state);
	};

	const toggleMovement = () => {
		const new_state = state.clone();
		new_state.movement = !props.state.movement;
		props.pushUpdate(new_state);
	};

	const toggleRewind = () => {
		const new_state = state.clone();
		new_state.rewind = !props.state.rewind;
		props.pushUpdate(new_state);
	};

	const updateDelay = (delay_index:number, new_value: string) => {
		const value_as_number = parseInt(new_value);
		if(isNaN(value_as_number))
			return;
		const updatedDelays = filledDelays.map((value,index) => index == delay_index ? parseInt(new_value) : value);
		const new_state = props.state.clone();
		new_state.delays = updatedDelays;
		new_state.mark_dirty();
		props.pushUpdate(new_state);
	};

	const change_dir_count = (e: React.FormEvent<HTMLElement> | Event) => {
		const new_dircount = parseInt((e.target as HTMLSelectElement).value);
		if(isNaN(new_dircount))
			return;
		if(new_dircount == state.dirs)
			return;
		const new_state = state.clone();
		new_state.set_dirs(new_dircount);
		new_state.mark_dirty();
		props.pushUpdate(new_state);
	};


	const toggleInfiniteLoop = () => {
		const new_state = state.clone();
		new_state.loop = new_state.loop === 0 ? 1: 0;
		props.pushUpdate(new_state);
	};

	const updateLoopCount = (new_count: string) => {
		const parsedCount = parseInt(new_count);
		if(isNaN(parsedCount))
			return;
		if(parsedCount <= 0)
			return;
		if(state.loop == parsedCount)
			return;
		const new_state = state.clone();
		new_state.loop = parsedCount;
		props.pushUpdate(new_state);
	};

	const [selectedFrame,setSelectedFrame] = useState<number | null>(null);

	useGlobalHandler<ClipboardEvent>("paste", async (e) => {
		if(selectedFrame == null)
			return;
		e.preventDefault();
		const data = e.clipboardData!;
		// handle 'image/png' files
		for (let index = 0; index < data.files.length; index++) {
			const file = data.files.item(index);
			if (file?.type !== 'image/png')
				continue;
			const fileData = await file.arrayBuffer();
			const prospectiveState = await Image.load(fileData);
			if (prospectiveState.width == state.width && prospectiveState.height == state.height) {
				///Replace selected frame with png
				const new_state = state.clone();
				new_state.frames[selectedFrame] = prospectiveState;
				new_state.frames_encoded[selectedFrame] = prospectiveState.toDataURL();
				props.pushUpdate(new_state);
				return;
			}
		}
		// Handle copied frames
		const copied_frame = data.getData("dmi-frame");
		if (copied_frame != "") {
			const new_state = state.clone();
			new_state.frames[selectedFrame] = await Image.load(copied_frame);
			new_state.frames_encoded[selectedFrame] = copied_frame;
			props.pushUpdate(new_state);
			return;
		}
	}, [selectedFrame,state]);

	useGlobalHandler<ClipboardEvent>("copy", (e) => {
		if (selectedFrame != null) {
			e.preventDefault();
			const frame = state.frames_encoded[selectedFrame];
			e.clipboardData?.setData("dmi-frame", frame);
		}
	}, [selectedFrame, state]);


	return (
		<div>
			<div className='stateProperties'>
				<VSCodeTextField value={state.name} onChange={e => updateName((e.target as HTMLInputElement).value)}>State name</VSCodeTextField>
				<div>
					<label>Directions</label>
					<VSCodeDropdown style={{marginLeft: '1em'}} value={state.dirs.toString()} onChange={change_dir_count}>
						<VSCodeOption value="1">1</VSCodeOption>
						<VSCodeOption value="4">4</VSCodeOption>
						<VSCodeOption value="8">8</VSCodeOption>
					</VSCodeDropdown>
				</div>
				<div>
					<VSCodeCheckbox checked={state.movement} onChange={toggleMovement}>Movement state</VSCodeCheckbox>
				</div>
				<div>
					<VSCodeCheckbox checked={state.rewind} onChange={toggleRewind}>Rewind animation</VSCodeCheckbox>
				</div>
				<div>
					<VSCodeTextField disabled={state.loop === 0} value={state.loop !== 0 ? state.loop.toString() : "∞"} onChange={e => updateLoopCount((e.target as HTMLInputElement).value)}>Loop count</VSCodeTextField>
					<VSCodeCheckbox style={{marginLeft: '1em'}} checked={state.loop === 0} onChange={toggleInfiniteLoop}>Loop infinitely</VSCodeCheckbox>
				</div>
			</div>
			<VSCodeDivider />
			<div className='directionalDetailPreview'>
				{previewGrid()}
			</div>
			<VSCodeDivider />
			<div style={dynamicStyle}>
				<div className="delaysGrid">
					<div className="gridHeader">Delay</div>
					{filledDelays.map((delay,index) => <div><EditableField value={delay.toString()} onChange={val => updateDelay(index, val)}/></div>)}
				</div>
				<div className='frameGrid'>
					{[...Array(state.dirs)].map((_,dir_index) => (
					<>
					<div className="gridHeader">{DirNames[dir_index]}</div>
					{[...Array(state.framecount)].map((_,frame) => <div className={state.frame_index(frame,DmiState.DIR_ORDER[dir_index]) == selectedFrame ? "selected" : ""} onClick={() => setSelectedFrame(state.frame_index(frame,DmiState.DIR_ORDER[dir_index]))}><img className='frame' src={state.get_frame_encoded(frame, DmiState.DIR_ORDER[dir_index])}/></div>)}
					</>))}
				</div>
			</div>
		</div>);
};