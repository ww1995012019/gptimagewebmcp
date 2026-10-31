# Personal Image MCP（ChatGPT 浏览器版）

让 Claude Code 通过你自己 Chrome 里已登录的 ChatGPT 网页生成或编辑图片，并保存到本地。不需要 API Key，使用的是你 ChatGPT 账号的网页生图额度。

> **风险提示：** 本工具自动操作 ChatGPT 网页，这可能违反 OpenAI 的使用条款，使用者的账号有被限制或封禁的风险，请自行评估。ChatGPT 网页改版后本工具可能失效，需要更新扩展。

目前仅支持 **Windows + Google Chrome（或 Edge）**。

## 安装（给使用者）

1. 安装 [Node.js 22 或更新版本](https://nodejs.org/)（或在 PowerShell 运行 `winget install OpenJS.NodeJS.LTS`），然后重新打开终端。
2. 把安装包解压到一个**以后不会移动**的位置，例如 `C:\Tools\personal-image-mcp`。
3. 双击 `install.cmd`。它会安装依赖、构建、生成并注册本地服务（只写当前用户的注册表），并注册到 Claude Code。
   - 只想先试模拟模式（不调用 ChatGPT、不消耗额度）：在终端运行 `install.cmd -Mock`。
   - 想让图片直接存进某个项目：`install.cmd -AllowedDirs "D:/MyGame"`（多个目录用分号分隔）。
4. 在 Chrome 打开 `chrome://extensions`，开启右上角“开发者模式”，点“加载已解压的扩展程序”，选择安装目录下的 `extension` 文件夹。
5. **完全退出 Chrome**（任务管理器里看不到 chrome.exe）后重新打开，让 Chrome 读到新注册的本地服务。
6. 打开并登录 https://chatgpt.com/ ，点扩展图标 → **启动**。看到“已连接”即可关掉弹窗。
7. 新开一个 Claude Code 会话，直接说：“用 gptpic 生成一张……保存为 xxx.png”。

用完点扩展图标 → **关闭**，本地服务会退出；关闭 Chrome 也会让它退出。

### 卸载

```powershell
powershell -ExecutionPolicy Bypass -File scripts\uninstall.ps1 -UnregisterClaude
```

然后在 `chrome://extensions` 删除扩展，再删除安装目录。

### 常见问题

| 弹窗提示 | 处理 |
| --- | --- |
| 找不到本地服务（not found） | 先运行 `install.cmd`，再完全退出 Chrome 后重开。**请自己双击运行 `install.cmd`**：如果是让 Claude 桌面版等应用商店安装的应用代为运行，它写的注册表会被系统隔离，Chrome 读不到 |
| 本地服务拒绝了这个扩展（forbidden） | 重新运行 `install.cmd`；扩展 ID 必须是 `hlnfblgpemohiaiadcpodbfhfmdamgcl` |
| EXTENSION_OFFLINE | 扩展没连上：点扩展图标 → 启动 |
| PATH_DENIED | 保存路径不在工作区、输出目录或 `IMAGE_ALLOWED_DIRS` 里；报错会列出允许的目录。需要时编辑 `.env` 的 `IMAGE_ALLOWED_DIRS`，再重启 Claude 会话 |
| DRAFT_EXISTS | ChatGPT 输入框里有草稿，清空后重试 |
| TIMEOUT / JOB_EXPIRED | 先去 ChatGPT 看图是否已生成，可能已消耗额度，不要直接重试 |

本地服务的日志在安装目录 `logs\bridge.log`，反馈问题时请附上。

## 配置（.env）

安装脚本会从 `.env.example` 生成 `.env`，之后不会再覆盖。常用项：

```dotenv
IMAGE_TEST_MODE=false                  # true 为模拟模式
IMAGE_ALLOW_BROWSER_GENERATION=true
IMAGE_OUTPUT_DIR=./output              # 没有工作区时，只写文件名就保存到这里
IMAGE_ALLOWED_DIRS=D:/MyGame;D:/Art    # 允许保存的其他目录，用分号分隔
IMAGE_USE_WORKSPACE=true               # 把当前项目当作工作区
IMAGE_TIMEOUT_MS=300000                # 单张最长等待时间
```

**保存位置：** Claude Code、Cursor 等工具会在你当前打开的项目文件夹里启动本服务，这个文件夹就是**工作区**。相对路径（如 `assets/item.png`）直接存到工作区里，工作区里的绝对路径也可以，不需要再手动复制。用户主目录、磁盘根目录和系统目录不会被当作工作区，这时相对路径存到 `IMAGE_OUTPUT_DIR`。`list_image_models` 会返回当前识别到的工作区。要存到工作区以外的地方，把目录加进 `IMAGE_ALLOWED_DIRS`。

改完 `.env` 后需要新开 Claude 会话（或 `/mcp` 重新连接），并点扩展“关闭”再“启动”。

真实生图耗时较长，如果 Claude 先于本服务超时，可在启动 Claude 前设置环境变量 `MCP_TOOL_TIMEOUT=360000`。超时不代表没扣额度。

## 打包分发（给维护者）

```powershell
powershell -ExecutionPolicy Bypass -File scripts\package.ps1
```

生成 `release\personal-image-mcp-<版本>.zip`。脚本只打包白名单文件，并拒绝包含 `.env`、`.bridge-token`、`extension/connection.json`、`.browser-profile`（含登录会话）、`node_modules`、`dist`、`output`、`logs`、`native-host`。**不要直接压缩整个目录发给别人。**

扩展 ID 由 `extension/manifest.json` 里的 `key` 固定，与 `src/bridge/extension-id.ts` 中的 `EXTENSION_ID` 必须一致；本地服务只接受这个扩展的请求。

旧的 `npm run bridge` 手动方式和 `IMAGE_BROWSER_MODE=playwright` 专用浏览器方式仍保留，供调试使用，见 [EXTENSION.md](EXTENSION.md)。

## 工具

| 工具 | 作用 |
| --- | --- |
| generate_image | prompt、size、quality、background、output_path、可选 reference_paths（1–4 张参考图，保持画风/配色/角色一致）、model、overwrite；保存 PNG/WebP |
| edit_image | 上述参数加 input_path；上传本地图片并按文字编辑，也可同时带 reference_paths |
| generate_assets | prompts 数组（1–3 项）、output_dir、background、可选 reference_paths（每张都带同一组参考图，适合做成套素材）；串行生成，分别返回成功或错误 |
| list_image_models | 返回当前模式、未知能力、限制及本地输出格式，不伪造模型列表 |
| read_image | 读取授权目录里的图片并返回 MCP 图片内容，预览最大 1024 像素 |

size 接受 1024x1024、1536x1024、1024x1536；quality 接受 auto/low/medium/high；background 接受 auto/transparent/opaque。这些只是给 ChatGPT 的提示词要求，网页不保证执行。返回实际宽高、字节数、绝对路径和相对于主输出目录的路径。WebP 是下载后的本地转换，不代表网页直接支持该格式。

overwrite 默认 false；编辑时使用不同 output_path 可保留原图。输出文件已存在时在发起生成前报错。若下载期间其他程序创建同名文件，最终写入仍会拒绝覆盖。生成后保存失败也可能已消耗额度。

## 测试提示词

先在模拟模式验证集成：

> 使用 gptpic 生成一张科技风格游戏道具图片，要求 1024×1024、透明背景，保存为 test-item.png。然后用 read_image 查看结果，并告诉我是否处于模拟模式。

开启真实模式后：

> 帮我生成一张科技风格游戏道具图片，要求 1024×1024、透明背景，保存到 C:/Users/Administrator/Desktop/my-game/public/images/item.png，不允许覆盖。

> 将 C:/Users/Administrator/Desktop/my-game/public/images/item.png 的蓝色部分改成金色，保留构图，保存为同目录 item-gold.png，不覆盖原图。

> 用 generate_assets 分别生成能量电池、激光剑、医疗包三张道具图，透明背景，保存到 C:/Users/Administrator/Desktop/my-game/public/images。报告每项结果并读取图片检查。

## 验证和维护

```powershell
npm run build
npm test
```

自动测试包含真实 stdio MCP 客户端的工具发现和模拟调用，以及本地 HTTP 测试页上的实际浏览器上传/提交/下载。它不访问 ChatGPT，不消耗会员额度。测试浏览器由 IMAGE_BROWSER_CHANNEL 指定。构建文件与 node_modules 不必提交，保留 package-lock.json 以便 `npm ci` 重现。

真实网页尚未在你的登录账号中端到端验证。默认选择器集中在 `.env.example`，页面变化可能需要更新：提示词编辑器、发送按钮、助手消息中的结果图、该消息中的下载按钮。网页若没有直接文件上传控件或下载按钮，本版会报错或超时；可能需要按实际 DOM 调整 `src/providers/browser.ts`。它不会点击验证码、提取登录令牌、绕过反自动化检查，也不会通过截图冒充原始图片下载。

检测到限流时明确报错；**不会自动重新提交生图请求**，因为无法确认网页是否已经消耗额度。并发上限为 1，忙时返回 BUSY，批量最多 3 张且部分失败不撤销成功项。网络导航与下载有时限，整次网页任务也有超时；关闭页面不能撤销已经提交的云端任务。

专用 `.browser-profile` 包含敏感登录会话，已加入 gitignore，请勿分享或上传。`.env` 也已忽略。stdout 仅输出 MCP 协议，诊断走 stderr；无 API Key 日志。

路径限制拒绝授权根之外的路径、Windows ADS、现有符号链接和 junction。目录应由你控制，不应允许不可信进程在检查和写入之间替换目录；这不是对抗本机恶意程序的操作系统沙箱。只授权必要目录，不要授权整块磁盘。

Provider 接口在 `src/providers/types.ts`，网页实现在 browser.ts，模拟实现在 mock.ts；以后可新增 API provider，而不应假设文本兼容 API 就支持图像。

参考：[MCP SDK v2](https://ts.sdk.modelcontextprotocol.io/v2/)、[Playwright persistent context](https://playwright.dev/docs/api/class-browsertype#browser-type-launch-persistent-context)、[Claude Code MCP 配置](https://code.claude.com/docs/en/mcp)。
