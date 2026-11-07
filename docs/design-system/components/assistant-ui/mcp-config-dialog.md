---
title: MCP config dialog（MCP 配置对话框）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
comments: false
---

# MCP config dialog（MCP 配置对话框）

让用户查看应用内置的 MCP 连接器，添加自己的服务器，并管理连接和身份验证。

<demo react="assistant-ui/mcp-config-dialog-demo.tsx" />

## 安装 {#installation}

```bash
npx shadcn@latest add "@assistant-ui/mcp-config"
```

运行时组件从 assistant-ui 运行时读取状态。如果项目还没有运行时，先初始化，再用运行时提供器包裹应用。

```bash
npx assistant-ui@latest init
```

```tsx
import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { useChatRuntime, AssistantChatTransport } from "@assistant-ui/ai-sdk";

export default function App() {
  const runtime = useChatRuntime({
    transport: new AssistantChatTransport({ api: "/api/chat" }),
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      {/* 应用组件 */}
    </AssistantRuntimeProvider>
  );
}
```

## 快速开始 {#getting-started}

把 MCP 管理器注册到助手配置，再将对话框放在该配置的作用域内。

### 挂载管理器 {#mount-the-manager}

用 `McpManagerResource` 定义内置连接器，然后以 `AuiConfig({ mcp: ... })` 注册到运行时，或通过 `AuiProvider` 扩展已有配置。

```tsx
import { AuiConfig, AuiProvider, useAui } from "@assistant-ui/react";
import { McpManagerResource } from "@assistant-ui/react-mcp";

export function McpProviders({ children }: { children: React.ReactNode }) {
  const aui = useAui();
  const config = AuiConfig({
    mcp: McpManagerResource({
      connectors: [
        { id: "linear", name: "Linear", url: "https://mcp.linear.app/mcp", auth: { type: "oauth" } },
      ],
    }),
  });
  return (
    <AuiProvider extends={aui} config={config}>
      {children}
    </AuiProvider>
  );
}
```

### 渲染对话框 {#render-the-dialog}

在 MCP 管理器的作用域内放置 `McpConfigDialog`。它自带触发按钮。

```tsx
import { McpConfigDialog } from "@/components/assistant-ui/elements/mcp-config.aui";

<McpConfigDialog />
```

## 结构 {#anatomy}

对话框分为连接器和自定义服务器两区。服务器卡片显示名称、状态及连接操作，自定义区另有新增表单。

```tsx
<Dialog>
  <DialogTrigger>{/* plug icon + "MCP 服务器", or your own children */}</DialogTrigger>
  <DialogContent>
    <section> {/* Connectors */}
      {/* one server card per app-defined connector */}
    </section>
    <section> {/* Custom servers */}
      {/* one server card per user-added server */}
      {/* "添加服务器" trigger, or the add form once opened */}
    </section>
  </DialogContent>
</Dialog>
```

## 示例 {#examples}

可以替换入口、在其他界面复用单个服务器卡片，或自定义验证输入项。

### 自定义触发按钮 {#custom-trigger}

将自己的按钮传给 `McpConfigDialog` 的 `children`，用它打开对话框。

```tsx
<McpConfigDialog>
  <button type="button">Connectors</button>
</McpConfigDialog>
```

### 在对话框外渲染服务器卡片 {#a-server-card-outside-the-dialog}

用 `McpServerByIdProvider` 选择服务器，再组合 `McpServerPrimitive.Root`、`Name` 和 `ConnectButton`。

```tsx
import { McpServerByIdProvider, McpServerPrimitive } from "@assistant-ui/react-mcp";

<McpServerByIdProvider id="linear">
  <McpServerPrimitive.Root>
    <McpServerPrimitive.Name />
    <McpServerPrimitive.ConnectButton>Connect</McpServerPrimitive.ConnectButton>
  </McpServerPrimitive.Root>
</McpServerByIdProvider>
```

### 自定义身份验证字段 {#custom-auth-fields}

通过新增表单或服务器 primitive 组合认证方式、令牌输入和提交控件。

```tsx
<McpAddFormPrimitive.AuthFields>
  {({ authType }) =>
    authType === "bearer" ? (
      <McpAddFormPrimitive.BearerTokenField asChild>
        <MyTokenField />
      </McpAddFormPrimitive.BearerTokenField>
    ) : null
  }
</McpAddFormPrimitive.AuthFields>
```

## API 参考 {#api-reference}

对话框与管理器、服务器和表单 primitive 分别对应不同层级。

### McpConfigDialog 属性 {#mcpconfigdialog-props}

`children` 可传触发元素，省略时使用默认按钮。

### McpManagerPrimitive {#mcpmanagerprimitive}

提供连接器与自定义服务器的列表范围。

### McpServerPrimitive {#mcpserverprimitive}

呈现服务器名称、状态、授权及连接、断开等操作。

### McpAddFormPrimitive {#mcpaddformprimitive}

提供新增服务器的字段、验证与提交。

### 管理器与服务器状态 {#manager-and-server-state}

管理器列出内置和自定义服务器。服务器状态记录认证、连接进度、错误与可用工具。
