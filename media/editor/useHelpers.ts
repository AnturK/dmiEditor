import { DependencyList, useEffect } from "react";

export const useGlobalHandler = <T = Event>(
    name: string,
    handler: (evt: T) => void,
    deps: DependencyList = []
) => {
    useEffect(() => {
        const l = (evt: Event) => handler(evt as unknown as T);
        window.addEventListener(name, l);
        return () => window.removeEventListener(name, l);
    }, deps);
};

export function buildClassName<T extends Record<string, boolean>>(arg: T) {
    return Object.keys(arg)
        .filter(x => arg[x])
        .join(" ");
}
