const esbuild = require("esbuild");

const watch = process.argv.includes("--watch");
const minify = process.argv.includes("--minify");

// Build the editor provider
esbuild
    .build({
        entryPoints: ["src/extension.ts"],
        tsconfig: "./tsconfig.json",
        bundle: true,
        external: ["vscode"],
        sourcemap: false,
        minify,
        watch,
        platform: "node",
        outfile: "dist/extension.js"
    })
    .catch(() => process.exit(1));

// Build the webview editors
esbuild
    .build({
        entryPoints: ["media/editor/dmiEditor.tsx"],
        tsconfig: "./tsconfig.json",
        bundle: true,
        external: ["vscode"],
        sourcemap: false,
        minify,
        watch,
        platform: "browser",
        outfile: "dist/editor.js"
    })
    .catch(() => process.exit(1));
