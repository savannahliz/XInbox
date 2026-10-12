#!/bin/zsh
set -euo pipefail
INBOX_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$INBOX_ROOT"
INBOX_NODE="$(command -v node)"
INBOX_NODE_REAL="$(python3 -c 'import os,sys; print(os.path.realpath(sys.argv[1]))' "$INBOX_NODE")"
INBOX_VERSION="$("$INBOX_NODE" -p 'JSON.parse(require("fs").readFileSync("package.json")).version')"
INBOX_ARCH="$(uname -m)"
if [[ "$INBOX_ARCH" != arm64 ]]; then echo '此构建脚本当前针对 Apple Silicon。'; exit 1; fi
INBOX_BUILD="$INBOX_ROOT/build/desktop"
INBOX_APP="$INBOX_ROOT/dist/INbox.app"
INBOX_DMG="$INBOX_ROOT/dist/XInbox-$INBOX_VERSION-arm64.dmg"
mkdir -p "$INBOX_BUILD/module-cache" "$INBOX_BUILD/INbox.iconset" "$INBOX_ROOT/dist"
rm -rf "$INBOX_APP" "$INBOX_BUILD/image"
mkdir -p "$INBOX_APP/Contents/MacOS" "$INBOX_APP/Contents/Resources/app/desktop" "$INBOX_APP/Contents/Resources/runtime"
cp "$INBOX_NODE_REAL" "$INBOX_APP/Contents/Resources/runtime/node"
cp "$(dirname "$(dirname "$INBOX_NODE_REAL")")/LICENSE" "$INBOX_APP/Contents/Resources/runtime/Node-LICENSE"
cp -R src public node_modules "$INBOX_APP/Contents/Resources/app/"
cp package.json package-lock.json "$INBOX_APP/Contents/Resources/app/"
cp desktop/server.js "$INBOX_APP/Contents/Resources/app/desktop/"
swiftc -swift-version 5 -module-cache-path "$INBOX_BUILD/module-cache" -target arm64-apple-macos14.0 -O desktop/INbox.swift -o "$INBOX_APP/Contents/MacOS/INbox"
swiftc -swift-version 5 -module-cache-path "$INBOX_BUILD/module-cache" desktop/Icon.swift -o "$INBOX_BUILD/make-icon"
"$INBOX_BUILD/make-icon" "$INBOX_BUILD/INbox.iconset"
iconutil -c icns "$INBOX_BUILD/INbox.iconset" -o "$INBOX_APP/Contents/Resources/INbox.icns"
python3 - "$INBOX_APP" "$INBOX_VERSION" <<'PY'
import plistlib,sys
from pathlib import Path
app=Path(sys.argv[1]);version=sys.argv[2]
info={'CFBundleURLTypes':[{'CFBundleURLName':'INbox OAuth','CFBundleURLSchemes':['inbox']}],'CFBundleIdentifier':'com.inbox.personal-archive','CFBundleName':'INbox','CFBundleDisplayName':'INbox','CFBundleExecutable':'INbox','CFBundlePackageType':'APPL','CFBundleShortVersionString':version,'CFBundleVersion':'1','CFBundleIconFile':'INbox','LSMinimumSystemVersion':'14.0','NSHighResolutionCapable':True,'NSAppTransportSecurity':{'NSAllowsLocalNetworking':True},'NSHumanReadableCopyright':'INbox personal archive'}
(app/'Contents/Info.plist').write_bytes(plistlib.dumps(info))
PY
codesign --force --sign - "$INBOX_APP/Contents/Resources/runtime/node"
codesign --force --sign - "$INBOX_APP"
codesign --verify --deep --strict "$INBOX_APP"
mkdir -p "$INBOX_BUILD/image"
cp -R "$INBOX_APP" "$INBOX_BUILD/image/"
ln -s /Applications "$INBOX_BUILD/image/Applications"
cat > "$INBOX_BUILD/image/安装说明.txt" <<'TXT'
INbox · macOS 14+ / Apple Silicon

将 INbox 拖到 Applications，然后打开。
首次安装的数据与加密配置保存在 ~/Library/Application Support/INbox。
本机开发与 MCP 共用库时，数据位置由该目录的 library-location.json 指定。
X OAuth 回调地址为 http://127.0.0.1:4319/auth/callback。
AI 与 Ask Agent 侧栏可拖动左侧边缘调节宽度。
Codex / DeepSeek Harness 使用本机已安装 Runtime，在终端设置中连接。

这是本机测试构建，使用临时签名，尚未经过 Apple 公证。
TXT
hdiutil create -volname INbox -srcfolder "$INBOX_BUILD/image" -format UDZO -ov "$INBOX_DMG"
hdiutil verify "$INBOX_DMG"
(cd "$INBOX_ROOT/dist" && shasum -a 256 "$(basename "$INBOX_DMG")" > "$(basename "$INBOX_DMG").sha256")
echo "$INBOX_DMG"
