import { readFileSync } from "fs";
import { Dmi } from "../shared/dmi";
import { expect, test } from "@jest/globals";
import { resolve } from "path";

test("basic DMI creation", () => {
    const test_dmi = new Dmi(32, 32);
    expect(test_dmi.width).toBe(32);
    expect(test_dmi.height).toBe(32);
});

test("basic DMI parsing", async () => {
    const dmi_data = readFileSync(resolve(__dirname, "./examples/letters.dmi"));
    const dmi = await Dmi.parse(dmi_data);
    expect(dmi.width).toBe(32);
    expect(dmi.height).toBe(32);
    expect(dmi.states.length).toBe(3);
    expect(dmi.states.map(x => x.name)).toContain("a");
    expect(dmi.states.map(x => x.name)).toContain("b");
    expect(dmi.states.map(x => x.name)).toContain("c");
});

test("stateless DMI parsing", async () => {
    const dmi_data = readFileSync(resolve(__dirname, "./examples/stateless.dmi"));
    const dmi = await Dmi.parse(dmi_data);
    expect(dmi.width).toBe(32);
    expect(dmi.height).toBe(32);
    expect(dmi.states.length).toBe(0);
});

test("non-square DMI parsing", async () => {
    const dmi_data = readFileSync(resolve(__dirname, "./examples/rectangles.dmi"));
    const dmi = await Dmi.parse(dmi_data);
    expect(dmi.width).toBe(32);
    expect(dmi.height).toBe(64);
    expect(dmi.states.length).toBe(4);
});
