# 使用默认 Google Chrome（推荐）

此模式通过你手动加载的 Chrome 扩展控制选中的 ChatGPT 标签页，沿用该浏览器的登录、代理和扩展。**不需要启动专用浏览器，不需要 npm run login，也无需远程调试参数。**

## 一次性安装

在 PowerShell 中执行：

```powershell
cd C:\Users\Administrator\Desktop\mcp\image-mcp
npm ci
npm run build
npm run bridge
```

桥接服务监听 `127.0.0.1:43127`，自动生成本机认证令牌和扩展的 `connection.json`。首次配置文件已在开发过程中准备好。不要分享 `.bridge-token` 或 `extension/connection.json`，这两个文件都已加入 gitignore。

在你日常使用的 Chrome 中：

1. 打开 `chrome://extensions`。
2. 开启右上角“开发者模式”。
3. 点击“加载已解压的扩展程序”。
4. 选择 `C:\Users\Administrator\Desktop\mcp\image-mcp\extension`。
5. 在默认浏览器中打开 ChatGPT，确保已登录，并新建一个用于 MCP 的空白对话。
6. 点击 Chrome 扩展菜单中的 **Personal Image MCP Bridge**，会打开连接页面。
7. 在列表中选择那个 ChatGPT 标签页，再点“连接选中标签页”。

保持桥接终端、扩展连接页和所选 ChatGPT 标签页打开。只打开一个扩展连接页。连接页不自动提交测试生图；它会等待 MCP 工具请求。

扩展需要在 ChatGPT 页面执行 DOM 操作，以及访问本机桥接地址；不请求 cookies、history、debugger 或所有网站权限。连接令牌只用于本地桥接，不是 ChatGPT 凭据。ChatGPT 登录凭据不传到 MCP。

## 配置真实模式

本项目 `.env` 现在已经选择 `IMAGE_BROWSER_MODE=extension`，但仍为模拟模式。准备生成真实图片时设置：

```dotenv
IMAGE_BROWSER_MODE=extension
IMAGE_TEST_MODE=false
IMAGE_ALLOW_BROWSER_GENERATION=true
IMAGE_OUTPUT_DIR=./output
```

然后重启 Claude Code 的 MCP 连接。修改输出授权目录、用户级 MCP 注册和测试提示词见 README。注册命令无需改变，仍使用 `dist/index.js`。桥接服务独立运行，不依赖 Codex；以后请在你自己的 PowerShell 终端运行 `npm run bridge`。

## 使用行为和限制

- 连接页只操作你手动选择的标签页。不要在任务期间切换其对话或手动发送消息，编辑器已有草稿时会拒绝覆盖。
- 工具收到调用才会填写提示词、上传输入图片并提交；不绕过验证码，不调用非公开 API。
- 批量生成仍最多 3 张、并发 1；桥接服务跨 MCP 进程拒绝同时提交的任务。
- 扩展保存新助手回复中**可见图片的资源**，可能是网页预览分辨率，不保证与“下载原图”一致。MCP 返回的是实际保存的尺寸。
- 尺寸、质量、透明背景仍是提示词要求，不能伪造网页模型支持能力。
- 跨域图片资源若无法从页面读取、DOM 结构变化、附件控件未展示、验证码、网络限制均会明确报错或超时，需要按真实页面调整 automation.js。
- 扩展修改源码后，在 `chrome://extensions` 点该扩展的“重新加载”，并重新打开连接页。
- 停止连接会停止后续页面操作，但无法撤回已提交的云端生图。超时也不能证明额度未被使用。不会自动重试提交同一提示词。
- 关闭连接页或桥接终端会断开服务；下次重新打开并连接即可。令牌失配时重新运行桥接服务，再重新加载扩展。
- 本地 bridge 的状态和任务路由需要 Bearer 令牌，仅绑定回环地址；不要通过端口映射暴露此服务。它不是用来防御拥有同一 Windows 用户文件访问权的恶意程序的。

如需退回原专用浏览器方式，将 `IMAGE_BROWSER_MODE=playwright`，再使用 `npm run login`。默认 Chrome 模式忽略 profile/channel 设置。

## 已验证和未验证

### 发送等待超时排查（扩展 1.1.1）

扩展 1.1.3 修复等待结果时 null.data 异常；页面异常会以 PAGE_ACTION_FAILED [poll] 等形式返回，丢失执行上下文会报 PAGE_RESULT_MISSING。更新需重新加载扩展并关闭旧连接页。若之前任务已发送，先让网页生成完成并手动下载已有图片，不要重新调用 generate_image 以免重复消耗额度。此修复不会恢复旧连接页已经丢失的任务。

扩展 1.1.2 增加输入框重新渲染、ProseMirror 和包装节点兼容。诊断中应出现 `version: "1.1.2"`。若仍为 EDITOR_MISSING，先将“检查页面（不发送）”返回的 page/editables 信息用于排查，不必重复生图。EDITOR_AMBIGUOUS 表示多个可编辑区域，扩展为避免输入到错误位置而停止。诊断不包含草稿文字。

已修复只识别 `data-testid=send-button` 以及无关页面进度条阻止发送的问题，兼容 composer-submit-button、输入区域内明确的中英文发送按钮。disabled、aria-disabled、隐藏和多个候选按钮仍会阻止误点。

更新后在 `chrome://extensions` 重新加载扩展，关闭旧连接页，再点击扩展打开新连接页。可先选择 ChatGPT 标签并点击“检查页面（不发送）”：只返回编辑器/按钮状态，不返回草稿文字或对话内容。SEND_BUTTON_MISSING 表示按钮标记尚不兼容；SEND_DISABLED 表示网页尚未允许发送；UPLOAD_PENDING 表示输入区域仍在上传；SEND_AMBIGUOUS 表示识别出多个按钮而拒绝猜测。连接前无草稿时按钮禁用可能是正常情况。

之前超时留下的草稿需要你自行清空或手动发送；扩展不会覆盖现有草稿，也不会自动重试。关闭旧连接页后若新连接提示 ANOTHER_CONTROLLER_CONNECTED，等待 15 秒使旧连接过期后再连接。

已验证 Node 侧桥接认证、网页来源限制、单连接控制器、任务单次投递、并发拒绝、超时、结果返回；已在独立 Chrome 测试实例中使用本地模拟 ChatGPT DOM 验证上传、草稿保护、提交和可见图片读取。

**尚未在你的默认 Chrome 中手动加载此扩展，也没有验证真实 ChatGPT 生图。**本地模拟测试不能证明真实网页当前 DOM 兼容。首次真实使用可能需要根据你看到的页面调整选择器。

实现依据：[Chrome scripting](https://developer.chrome.com/docs/extensions/reference/api/scripting)、[扩展网络权限](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests)。
