# 验证记录

## 页面返回值处理（扩展 1.1.3）

用户报告已发送且仍在生成，扩展报 null.data。已定位 controller 的 poll 结果未判空就读取 data。页面脚本现在捕获异常并返回 JSON 错误，控制器按 context/prepare/ready/submit/poll 校验返回结构，缺失结果明确报 PAGE_RESULT_MISSING，页面执行异常报 PAGE_ACTION_FAILED 并标明阶段。服务侧同时校验桥接 JSON 空值。

编译与扩展脚本语法检查通过；11 项测试通过，包括 null/undefined/空数组/缺失 frame.result、错误结构、页面异步异常以 JSON 返回及正常等待/成功结果。没有自动重试或执行真实生图。真实页面产生空返回的最初异常原因尚不能从旧诊断还原；新版会保留该原因。

## 输入框识别修复（扩展 1.1.2）

根据用户 EDITOR_MISSING 诊断，已扩展固定 ID 之外的 ProseMirror、输入框包装节点和带明确发送按钮的输入区域识别，忽略隐藏旧节点，多个候选拒绝猜测。增加版本、页面加载状态和输入控件结构诊断，不返回草稿或对话文字。发送等待阶段也检查对话是否切换。

编译、扩展脚本语法检查通过；10 项测试全部通过，新增 DOM 重渲染替换编辑器、包装 ID、隐藏旧输入框、语义输入区、多候选拒绝及无关输入区保护。真实用户页面仍无法直接观察，不能据此断言用户现场问题已经解决。建议加载扩展 1.1.2 后先使用不发送诊断，无需重复真实请求。

## 发送状态修复（扩展 1.1.1）

`npm run build`、扩展脚本语法检查通过；`npm test` 共 9 项全部通过。新增回归覆盖 composer-submit-button、中英文发送标签、无关进度条、上传进度、disabled/aria-disabled、隐藏按钮、多候选拒绝及输入区域之外的发送按钮隔离。默认 Chrome 未接入当前调试工具，无法确认用户真实页面的具体 DOM，新增无发送副作用的诊断按钮供现场确认。没有提交真实生图。

## 默认 Chrome 扩展模式（2026-10-18 更新）

`npm run build` 成功，`npm test` 共 8 项全部通过。新增桥接认证、Origin 限制、控制器互斥、任务单次投递、并发拒绝、超时返回，以及 Chrome 中模拟页面的草稿保护、图片上传、提交、可见资源读取测试。扩展 JavaScript 已通过 `node --check`。

当前默认 IMAGE_BROWSER_MODE=extension。默认 Chrome 的扩展加载需用户手动操作，真实 Chrome 扩展上下文和真实 ChatGPT 生图尚未端到端验证。没有发起真实图片请求，也未修改 Claude Code 注册配置。以下是旧专用浏览器模式的初始验证记录。

验证日期：2026-10-18（Asia/Shanghai）。Windows，Node v22.20.0，npm 10.9.3。

- `npm install`：成功，已生成 package-lock.json。
- `npm run build`：成功，官方 MCP server/client v2.3.1。
- `npm test`：5 项通过，0 失败。
- 参数必填项、枚举、默认禁止覆盖、批量最多 3 项：通过。
- 路径穿越、Windows ADS、junction、已有文件拒绝覆盖：通过。
- 模拟 PNG、WebP 转换、实际尺寸和大小：通过。
- 真实 stdio 子进程客户端：发现 5 个工具，生成、编辑、读取、批量、模型查询及错误返回通过。
- 注入 provider 限流错误：部分失败保留其他成功结果，不重复提交同一 prompt。
- 使用本机 Edge 的本地 HTTP 测试页：上传、提示词提交、结果发现、原图下载通过。
- Playwright Chromium 下载：TLS ECONNRESET，未成功；使用已安装的 Edge 完成浏览器验证。

未验证：用户登录后的真实 ChatGPT 页面、真实图片生成/编辑和额度消耗行为。网页选择器可能需要按账号页面调整；本地 fixture 通过不能证明 ChatGPT 当前网页兼容。未提交任何真实生图请求。未修改 Claude Code 配置。
