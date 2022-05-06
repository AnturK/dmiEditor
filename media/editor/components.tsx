import { VSCodeTextField } from "@vscode/webview-ui-toolkit/react";
import React, { useEffect, useRef, useState } from "react";

interface EditableFieldsProps extends React.HTMLProps<HTMLDivElement> {
	value: string;
	displayValue?: string,
	label?: string;
	onChange: (value: any) => void;
}

// Text editable by doubleclicking it
export const EditableField: React.FC<EditableFieldsProps> = (props) => {
	const { value, displayValue, label, onChange, ...rest } = props;
	const rawDisplayValue = displayValue || value;
	const [editing, setEditing] = useState(false);
	const inputRef = useRef(null);

	const pushChange = () => {
		props.onChange((inputRef?.current as unknown as HTMLInputElement).value);
		setEditing(false);
	};

	const toggleEdit = () => {
		setEditing(!editing);
	};

	useEffect(() => {
		if(editing){
			(inputRef?.current as unknown as HTMLInputElement).focus();
		}
	},[editing]);

	

	return (<div
				{...rest}
				onDoubleClick={toggleEdit}>
				{editing && <VSCodeTextField ref={inputRef} value={props.value} onChange={pushChange} onBlur={() => setEditing(false)} />}
				{!editing && rawDisplayValue}
			</div>);
};