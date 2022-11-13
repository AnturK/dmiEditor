import React, { useState } from "react";
import { VSCodeTextField, VSCodeCheckbox, VSCodeDivider, VSCodeDropdown, VSCodeOption } from "@vscode/webview-ui-toolkit/react";
import { DmiState, Dirs, DirNames, Dmi } from "../../shared/dmi";
import { EditableField } from "./components";
import { Image } from 'image-js';
import { useGlobalHandler } from "./useHelpers";
import { messageHandler } from "./state";
import { MessageType } from "../../shared/messaging";

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
		const value_as_number = parseFloat(new_value);
		if(isNaN(value_as_number))
			return;
		const updatedDelays = filledDelays.map((value,index) => index == delay_index ? parseFloat(new_value) : value);
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

	const updateFrameCount = (new_count: string) => {
		const parsedCount = parseInt(new_count);
		if(isNaN(parsedCount))
			return;
		if(parsedCount <= 0)
			return;
		if(state.framecount == parsedCount)
			return;
		const new_state = state.clone();
		new_state.set_framecount(parsedCount);
		props.pushUpdate(new_state);
	};

	const [selectedFrame,setSelectedFrame] = useState<number | null>(null);

	const replaceFrame = (frame: number, image: Image) => {
		const new_state = state.clone();
		new_state.frames[frame] = image;
		new_state.frames_encoded[frame] = image.toDataURL();
		props.pushUpdate(new_state);
	};

	const clearFrame = (frame: number) => {
		replaceFrame(frame,DmiState.empty_frame(state.width,state.height));
	};

	const copyToClipboard = async (e : ClipboardEvent) => {
		if (selectedFrame != null) {
			const frameBlob = await state.frames[selectedFrame].toBlob();
			const item = new ClipboardItem({ 'image/png' : frameBlob });
			navigator.clipboard.write([item]);
		}
	};

	useGlobalHandler<ClipboardEvent>("paste", async (e) => {
		if(selectedFrame === null)
			return;
		e.preventDefault();

		/// First we check png files copypasted wholesale from system - ie windows file explorer copy on a some.png file because navigator.clipboard.read() just panics in this case.
		/// We do it first because rejected navigator.clipboard.read also clears this list. Don't ask why.
		const data = e.clipboardData!;
		const imagesFromFiles: Array<{image: Image, name : string}> = [];
		const raw_clipboard_errors = [];
		for (let index = 0; index < data.files.length; index++) {
			const file = data.files.item(index);
			if (file?.type !== 'image/png')
				continue;
			const fileData = await file.arrayBuffer();
			const prospectiveState = await Image.load(fileData);
			if (prospectiveState.width == state.width && prospectiveState.height == state.height) {
				imagesFromFiles.push({ image: prospectiveState, name : file.name});
			}
			else {
				//Don't display errors here since these values might not be used at all
				raw_clipboard_errors.push(`Size of pasted image (${prospectiveState.width}x${prospectiveState.height}) does not match size of DMI (${state.width}x${state.height})`);
			}
		}
		/// Next, actually try to read raw clipboard
		let clipboardContents : ClipboardItems;
		try {
			clipboardContents = await navigator.clipboard.read();
		} catch (error) {
			//It failed, possibly due to having these system copied files in there. Add them if any were found earlier.
			for (const found of imagesFromFiles) {
				replaceFrame(selectedFrame,found.image);
				break;
			}
			for (const error_message of raw_clipboard_errors) {
				// TODO: Just resize as needed
				messageHandler.sendEvent({ type: MessageType.Alert, text: error_message });
			}
			return;
		}
		/// Now we actually have access to raw clipboard data so:
		for (const item of clipboardContents) {
			/// Check if we have a png data blob 
			if(item.types.includes('image/png')){
				const data = await item.getType('image/png');
				const ab = await data.arrayBuffer();
				const fileData = new Uint8Array(ab);
				try {
					// These are usually just pngs, but in theory (according to chromium docs, but this might be different in electron/vscode) these can also have metadata so we try to parse as dmi
					const dmi_or_png = await Dmi.parse(fileData);
					if (dmi_or_png.width == state.width && dmi_or_png.height == state.height) {
						replaceFrame(selectedFrame,dmi_or_png.states[0].frames[0]);
						return;
					} else {
						// TODO: Just resize as needed
						messageHandler.sendEvent({ type: MessageType.Alert, text: `Size of pasted raw image (${dmi_or_png.width}x${dmi_or_png.height}) does not match size of DMI (${state.width}x${state.height})` });
					}
				} catch (error) {
					// Parse failed so it's some mangled metadata, just give up
					return;
				}
			}
		}
	}, [selectedFrame,state]);

	useGlobalHandler<ClipboardEvent>("copy", async (e) => {
		if (selectedFrame != null) {
			e.preventDefault();
			copyToClipboard(e);
		}
	}, [selectedFrame, state]);

	useGlobalHandler<ClipboardEvent>("cut", async (e) => {
		if(selectedFrame != null){
			e.preventDefault();
			copyToClipboard(e);
			clearFrame(selectedFrame);
		}
	}, [selectedFrame, state]);


	return (
		<div onClick={() => selectedFrame !== null && setSelectedFrame(null)}>
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
				<div>
					<VSCodeTextField value={state.framecount.toString()} onChange={e => updateFrameCount((e.target as HTMLInputElement).value)}>Frames</VSCodeTextField>
				</div>
			</div>
			<VSCodeDivider />
			<div className='directionalDetailPreview'>
				{previewGrid()}
			</div>
			<VSCodeDivider />
			<div style={dynamicStyle}>
				<div className='frameGrid'>
					<div className="gridHeader">Delay</div>
					{filledDelays.map((delay,index) => <div className="gridHeader"><EditableField value={delay.toString()} onChange={val => updateDelay(index, val)}/></div>)}
					{[...Array(state.dirs)].map((_,dir_index) => (
					<>
					<div className="gridHeader">{DirNames[dir_index]}</div>
					{[...Array(state.framecount)].map((_,frame) => {
						const index = state.frame_index(frame, DmiState.DIR_ORDER[dir_index]);
						const isSelected = index == selectedFrame;
						return <div key={index} className={isSelected ? "gridElement selected" : "gridElement"} onClick={e => { e.stopPropagation(); setSelectedFrame(index); } }><img className='frame' src={state.get_frame_encoded(frame, DmiState.DIR_ORDER[dir_index])} /></div>;
					})}
					</>))}
				</div>
			</div>
		</div>);
};