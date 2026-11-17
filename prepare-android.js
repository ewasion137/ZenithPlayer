const fs = require("fs");
const path = require("path");

const srcDir = path.join(__dirname, "Zenith");
const outDir = path.join(__dirname, "www");

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

function copyFiltered(src, dest) {
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
        if (entry.name === "script" || entry.name === "icon.ico") continue;
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            fs.mkdirSync(destPath, { recursive: true });
            copyFiltered(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

copyFiltered(srcDir, outDir);

const formPath = path.join(outDir, "form.html");
const indexPath = path.join(outDir, "index.html");
let html = fs.readFileSync(formPath, "utf8");

if (!html.includes('name="viewport"')) {
    html = html.replace(
        "<head>",
        '<head>\n        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />',
    );
}
if (!html.includes("android-bridge.js")) {
    html = html.replace(
        '<script src="theme-fx.js"></script>',
        '<script src="android-bridge.js"></script>\n        <script src="theme-fx.js"></script>',
    );
}

fs.writeFileSync(indexPath, html, "utf8");
fs.unlinkSync(formPath);

const bridgePath = path.join(outDir, "android-bridge.js");
if (!fs.existsSync(bridgePath)) {
    fs.writeFileSync(
        bridgePath,
        "window.electronAPI = window.electronAPI || {};\n",
        "utf8",
    );
}

console.log("[Zenith] Android www/ prepared.");