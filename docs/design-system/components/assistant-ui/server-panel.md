---
title: Server panel（服务器面板）
pageClass: nola-vis-doc shadcn-base-doc
editLink: false
comments: false
---

# Server panel（服务器面板）

查看服务器连接状态、可用能力和需要用户处理的事项。

MCP 服务器的紧凑列表，每行折叠为一个名称和一个状态点，直到你打开它以查看其传输和工具列表。对于运行时，服务器来自你的 MCP 连接。独立的，你传入列表。

<demo react="assistant-ui/server-panel-demo.tsx" />

## 安装 {#installation}

<ShadcnInstall>

<template #cli>

```bash
npx shadcn@latest add "@assistant-ui/elements-mcp-server-panel"
```

</template>

<template #manual>

- [组件源码和依赖](https://r.assistant-ui.com/styles/base-nova/elements-mcp-server-panel.json)

按注册表中的 `files` 路径复制组件源码，安装 `dependencies` 和 `registryDependencies` 中的依赖，再按项目配置调整导入路径。

</template>

</ShadcnInstall>

## 开始使用 {#getting-started}

**运行时版**

`@assistant-ui/react-mcp` 拥有 MCP 连接状态。安装其管理器一次，然后从树中的任何位置读取服务器及其工具。

### 挂载 MCP 管理器 {#mount-the-mcp-manager}

```tsx
"use client";

import { AuiConfig, AuiProvider, useAui } from "@assistant-ui/store";
import { McpManagerResource, type MCPConnector } from "@assistant-ui/react-mcp";

function McpManagerMount({
  connectors,
  children,
}: {
  connectors: MCPConnector[];
  children: React.ReactNode;
}) {
  const aui = useAui();
  const config = AuiConfig({ mcp: McpManagerResource({ connectors }) });
  return (
    <AuiProvider extends={aui} config={config}>
      {children}
    </AuiProvider>
  );
}
```

   `connectors` 中的每个连接器都成为管理器连接、跟踪和列出工具的一台服务器。用户通过 `McpAddFormPrimitive` 添加的自定义服务器加入同一列表，无需再次挂载。

### 列出服务器及其工具 {#list-servers-and-their-tools}

```tsx
"use client";

import { useState } from "react";
import { McpManagerPrimitive, McpServerPrimitive } from "@assistant-ui/react-mcp";
import { useAuiState } from "@assistant-ui/store";
import { PlugIcon } from "lucide-react";

function ServerRow() {
  const [open, setOpen] = useState(false);
  const name = useAuiState((s) => s.mcpServer.name);
  return (
    <McpServerPrimitive.Root>
      <button type="button" onClick={() => setOpen((v) => !v)}>
        <PlugIcon className="size-3.5" />
        {name}
      </button>
      {open && (
        <McpServerPrimitive.Tools>
          {(tool) => <span key={tool.name}>{tool.name}</span>}
        </McpServerPrimitive.Tools>
      )}
    </McpServerPrimitive.Root>
  );
}

export function McpServerList() {
  return (
    <McpManagerPrimitive.Root>
      <McpManagerPrimitive.Connectors>{() => <ServerRow />}</McpManagerPrimitive.Connectors>
      <McpManagerPrimitive.CustomServers>{() => <ServerRow />}</McpManagerPrimitive.CustomServers>
    </McpManagerPrimitive.Root>
  );
}
```

   `Connectors` 和 `CustomServers` 作用于它们渲染的每一行，因此 `useAuiState((s) => s.mcpServer...)` 和 `McpServerPrimitive.Tools` 解析为该一台服务器。每行在这里跟踪自己的 `open` 状态，因此一次可以扩展多个行。[MCP 配置对话框](./mcp-config-dialog) 在对话框外壳内提供了同一列表的完整版本，包括连接和授权操作。

**独立版**

独立的面板是一个受控列表：你拥有服务器、它们的状态以及展开的行。

### 保存服务器列表 {#hold-the-server-list}

```tsx
"use client";

import { useState } from "react";
import { McpServerPanel, type McpServer } from "@/components/assistant-ui/elements/mcp-server-panel";

const servers: McpServer[] = [
  { id: "files", name: "文件系统", transport: "stdio", status: "connected", tools: ["read_file", "write_file"] },
  { id: "search", name: "网页搜索", transport: "http", status: "needs-auth", tools: ["search"] },
];

export function Servers() {
  const [expandedId, setExpandedId] = useState<string>();
  return (
    <McpServerPanel
      servers={servers}
      expandedId={expandedId}
      onToggle={(id) => setExpandedId((current) => (current === id ? undefined : id))}
    />
  );
}
```

### 每次展开一台服务器 {#expand-one-server-at-a-time}

   `expandedId` 拥有单个 id，因此将其切换到新服务器会关闭打开的行。再次单击打开行自己的触发器将其清除，与上面的 `current === id ? undefined : id` 检查相匹配。

## 结构 {#anatomy}

```tsx
<div data-slot="mcp-server-panel">
  <div>{/* "n of m connected" */}</div>
  <button aria-expanded>
    {/* chevron, plug icon, name, tool count, status dot */}
  </button>
  {/* expanded: transport, status label, optional Authorize action, tool chips */}
</div>
```

标头计数仅统计 `status` 为 `"connected"` 的服务器。状态点为翠绿色表示已连接，脉冲暗点表示连接，琥珀色表示需要验证，红色表示失败，每个状态点都与仅限屏幕阅读器的文本配对。当 `onAuthorize` 被传递时，授权丸仅呈现在 need-auth 行上。如果没有它，行就会扩展而无法对其进行操作。

## 示例 {#examples}

### 将连接状态映射到四个点 {#map-connection-states-onto-four-dots}

**运行时版**

`McpServerPrimitive.Status`（及其后面的 `s.mcpServer.connectionState` 选择器）携带六种状态：`connected`、`connecting`、`authRequired`、`authPending`、`error`、`disconnected`。面板本身的`McpServerStatus`类型只有四个。将多余的两个折叠到最近的点中，然后将值传递给面板：

```tsx
import type { MCPConnectionState } from "@assistant-ui/react-mcp";
import type { McpServerStatus } from "@/components/assistant-ui/elements/mcp-server-panel";

function toPanelStatus(state: MCPConnectionState): McpServerStatus {
  switch (state) {
    case "connected":
      return "connected";
    case "connecting":
    case "authPending":
      return "connecting";
    case "authRequired":
      return "needs-auth";
    case "error":
    case "disconnected":
      return "failed";
  }
}
```

### 接入授权操作 {#wire-the-authorize-action}

**运行时版**

`McpServerPrimitive.OAuthLink` 启动配置对话框使用的相同 OAuth 流程。一旦 `connectionState` 为 `authRequired`，将其渲染为该行的授权操作：

```tsx
<McpServerPrimitive.OAuthLink className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-700">
  授权
</McpServerPrimitive.OAuthLink>
```

**独立版**

```tsx
<McpServerPanel
  servers={servers}
  onAuthorize={(id) => startOAuthFlow(id)}
/>
```

### 调整面板 {#restyle-the-panel}

两种用法都支持通过 `className` 调整根元素。该面板使用共享的 `paper` 表面作为背景，使用 `mono` 作为计数和状态文本，使用 `field` 和 `mono` 作为工具标签，因此在 `surfaces.tsx` 中重新定位这些标记会重新设置在其上构建的每个元素的样式。

## API 参考 {#api-reference}

**运行时版**

### McpManagerPrimitive 和 McpServerPrimitive {#mcpmanagerprimitive-and-mcpserverprimitive}

| 部分 | 渲染结果 | 说明 |
| -------------------------------------------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------- |
| `McpManagerPrimitive.Root` | `div` | 列表包装。加载存储后设置 `data-mcp-hydrated`。 |
| `McpManagerPrimitive.Connectors` | 渲染属性 | 迭代应用程序声明的连接器，每次调用一个 `{ server }`，并将 `s.mcpServer` 范围限定到该服务器。 |
| `McpManagerPrimitive.CustomServers` | 渲染属性 | 以相同的方式迭代用户添加的自定义服务器。 |
| `McpServerPrimitive.Root` | `div` | 从作用域服务器设置 `data-server-id`、`data-kind`、`data-connection-state` 和 `data-has-error`。 |
| `McpServerPrimitive.Name` | 文字 | 服务器的显示名称。 |
| `McpServerPrimitive.Status` | `span` | `data-state`设置为连接状态。默认情况下将状态呈现为文本。 |
| `McpServerPrimitive.Tools` | 渲染属性 | 迭代服务器的工具，每次调用一个 `MCPToolInfo`。当列表为空时不渲染任何内容。 |
| `McpServerPrimitive.ConnectButton` / `.DisconnectButton` / `.RemoveButton` | `button` | 在作用域服务器上调用 `connect()`、`disconnect()` 或 `remove()`。 |
| `McpServerPrimitive.OAuthLink` | `a` | 在新选项卡中链接到服务器的 `authorizationUrl`。没有一个就不会渲染任何东西。 |

### 服务器状态 {#server-state}

| 选择器 | 类型 | 说明 |
| ----------------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `s.mcpServer.name` | `string` | 显示名称。 |
| `s.mcpServer.connectionState` | `"connected" \| "connecting" \| "authRequired" \| "authPending" \| "error" \| "disconnected"` | 全连接状态，六个值。 服务器列出的每个工具的 |
| `s.mcpServer.tools` | `MCPToolInfo[]` | `{ name, description?, inputSchema }`。 |
| `s.mcpServer.lastError` | `{ message: string } \| null` | 当连接或列表工具调用失败时设置。 |
| `useMcpServerTool()` | `MCPToolInfo` | `McpServerPrimitive.Tools`内部当前工具。扔到外面。 |

**独立版**

### McpServerPanel {#mcpserverpanel}

| 属性 | 类型 | 默认值 | 说明 |
| ------------- | ---------------------- | -------- | -------------------------------------------------------------------------------------------------------------------- |
| `servers` | `readonly McpServer[]` |  | 要列出的服务器。 |
| `expandedId` | `string` |  | 当前扩容服务器的Id。 |
| `onToggle` | `(id: string) => void` |  | 单击服务器的行时使用服务器的 id 进行调用。如果没有它，服务器行将呈现为非交互式状态内容。 |
| `onAuthorize` | `(id: string) => void` |  | 从需求授权行上的授权胶囊形标签调用。省略它，胶囊形标签就不会呈现。 |
| `className` | `string` |  | 合并到根元素。 |

### McpServer 和 McpServerStatus {#mcpserver-and-mcpserverstatus}

| 字段 | 类型 | 说明 |
| ----------- | ------------------- | ------------------------------------------------------------------------- |
| `id` | `string` | 服务器的稳定密钥。 |
| `name` | `string` | 显示名称。 |
| `transport` | `string` | 展开时显示在状态标签旁边，例如`"stdio"` 或 `"http"`。 |
| `status` | `McpServerStatus` | `"connected" \| "connecting" \| "needs-auth" \| "failed"`. |
| `tools` | `readonly string[]` | 工具名称，展开时呈现为标签。 |

其余 `div` 属性会传给根元素。
