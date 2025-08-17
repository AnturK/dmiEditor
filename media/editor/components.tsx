import { VSCodeTextField } from "@vscode/webview-ui-toolkit/react";
import React, { useEffect, useRef, useState } from "react";
import { useGlobalHandler } from "./useHelpers";

interface EditableFieldsProps extends React.HTMLProps<HTMLDivElement> {
    value: string;
    displayValue?: string;
    label?: string;
    onChange: (value: any) => void;
    onEditingStateChanged?: (value: boolean) => void;
}

// Text editable by doubleclicking it
export const EditableField: React.FC<EditableFieldsProps> = props => {
    const { value, displayValue, label, onChange, onEditingStateChanged, ...rest } = props;
    const rawDisplayValue = displayValue || value;
    const [editing, setEditing] = useState(false);
    const inputRef = useRef(null);
    useEffect(() => {
        if (onEditingStateChanged) {
            onEditingStateChanged(editing);
        }
    }, [editing, onEditingStateChanged]);
    const pushChange = () => {
        props.onChange((inputRef?.current as unknown as HTMLInputElement).value);
        setEditing(false);
    };

    const toggleEdit = () => {
        setEditing(!editing);
    };
    const enableRename = () => {
        setEditing(true);
    };
    useEffect(() => {
        if (editing) {
            (inputRef?.current as unknown as HTMLInputElement).focus();
        }
    }, [editing]);

    useGlobalHandler(
        "keydown",
        (e:KeyboardEvent) => {
            if(editing){
                switch (e.code) {
                    case "Escape":
                    case "Enter":
                        setEditing(false);
                        e.preventDefault();
                        break;
                }
            }
        },
        [editing]
    );

    return (
        <div {...rest} onDoubleClick={editing ? undefined : toggleEdit}>
            {!editing && rawDisplayValue}
            {editing && (
                <VSCodeTextField
                    ref={inputRef}
                    value={props.value}
                    onChange={pushChange}
                    onBlur={() => setEditing(false)}
                />
            )}
        </div>
    );
};
