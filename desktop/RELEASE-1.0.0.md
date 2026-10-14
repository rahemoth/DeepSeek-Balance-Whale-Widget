Windows 桌面移植版首次发布。本仓库是 [MeteorNOX/DeepSeek-Balance-Whale-Widget](https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget) 的 fork，并非上游官方 Windows 发行版。

下载 `WhaleWidget-Setup-1.0.0-Windows-x64.exe` 运行安装向导，可选择安装目录并创建桌面和开始菜单快捷方式。`SHA256SUMS.txt` 提供文件校验值。适用于 Windows x64；未配置代码签名。

- 完整复用原版角色、泡泡、图片、动图、音效和记账界面。
- DS 金额余额、OpenCode Go 与 ChatGPT 套餐额度；ChatGPT 使用本机 Codex 登录态，额度进程自动跟随系统代理。
- 详细与迷你卡片互斥，50%–150% 缩放、拖动、跟随／固定布局、避让及重启恢复。
- 点鱼切换单来源余额泡泡；订阅泡泡仅展示 5h，自动关闭，点击余额仍可进入趣味文案和动图。
- GPT／OCG 百分比提醒，窗口周期内去重；DS 保持金额记账。
- 新数据位于 `%APPDATA%\WhaleWidget`，密钥通过 Windows DPAPI 加密。安装包不包含本机登录态、密钥或个人配置；卸载保留用户数据。

独立桌面进程尚未连接 DSH 会话事件；DSH 提问、授权和逐轮消耗不会自动同步。ChatGPT 额度需要本机已安装 Codex 并登录 ChatGPT。

代码沿用 MIT 许可。素材范围与上游作者信息见仓库 `LICENSE` 和 `PROVENANCE.md`，安装包内保留相同说明。

发布前验证：17 项后端测试、原项目核心检查、真实 NSIS 安装以及安装后的 Electron 界面测试通过；安装包包含上游许可和素材说明，不含本机凭据或个人配置。
