# Client 与 Protocol Adapters

## 真实作用

Client 和 protocol adapter 负责把 agent core 的事件流呈现给用户或外部系统。

它们不拥有 agent 行为。

Client 类型：

- Web。
- CLI。
- TUI。
- IDE。
- ACP。
- Mobile。
- Channel integrations。

## 统一接口

所有 client 应围绕同一组能力：

- Create/load session。
- Send prompt。
- Stream events。
- Resolve permission request。
- Replay session。
- Inspect artifacts。
- Cancel turn。

## Web Client

Web 是第一回归面。

必须优先支持：

- Session list。
- Transcript。
- Event timeline。
- Permission panel。
- Tool inspector。
- Diff viewer。
- Context inspector。
- Regression runner。

## CLI

CLI 是薄 adapter。

职责：

- 读取用户输入。
- 渲染 streaming text。
- 展示 approval prompt。
- 支持 slash commands。
- 支持 non-interactive mode。

CLI 不应该实现自己的 agent loop。

## ACP Server

ACP 是 protocol adapter。

职责：

- JSON-RPC transport。
- Method mapping。
- Event-to-update。
- Permission forwarding。
- Error mapping。

ACP 不应该：

- 构建 context。
- 执行 tools。
- 修改 memory。
- 拥有 session state machine。

## Mobile Remote-Control

移动端未来作为 remote-control client：

- 查看 session。
- 接收通知。
- 批准权限。
- 暂停/恢复/取消任务。
- 查看结果和 diff 摘要。

移动端不应该运行 agent core。

## 常见坑

- Web 直接写 storage。
- CLI 和 Web 各自维护 session state。
- ACP adapter 复制 core state machine。
- Mobile 为了方便绕过 permission API。
- Client projection 与 replay projection 不一致。

## 测试策略

- Event fixture rendering。
- Live/replay equivalence。
- Permission approval flow。
- Cancel flow。
- ACP JSON-RPC fixtures。
- Mobile control event fixtures。
