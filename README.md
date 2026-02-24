# 🛡️ ComfyUI Workflow Protector

**工作流保护与加密插件 | Workflow Protection & Encryption Plugin**

---

## 📖 简介 | Introduction

**中文：** ComfyUI Workflow Protector 是一款为 ComfyUI 设计的安全插件，提供多层保护机制防止工作流被未授权导出、复制或使用。支持密码保护和工作流文件加密，保护你的创作成果。

**English:** ComfyUI Workflow Protector is a security plugin for ComfyUI that provides multi-layered protection against unauthorized export, copying, or usage of workflows. It supports password-based access control and workflow file encryption to safeguard your creative work.

---

## ✨ 功能特性 | Features

### 🔒 导出保护 | Export Protection
- **中文：** 拦截所有导出途径，包括 Ctrl+S 另存、右键菜单导出、拖拽导出等
- **English:** Intercepts all export paths including Save As, context menu export, and drag-and-drop export

### 📋 复制保护 | Copy Protection
- **中文：** 保护 Ctrl+C / Ctrl+X / Ctrl+D 等快捷键操作，防止节点被复制或克隆
- **English:** Protects keyboard shortcuts (Ctrl+C / Ctrl+X / Ctrl+D) to prevent node copying or cloning

### 🔐 工作流加密 | Workflow Encryption
- **中文：** 使用 AES-256-CBC 加密算法（可选 XOR 后备方案），保存时可选择加密工作流文件。加密后的文件可跨机器使用，只需输入正确密码即可解密
- **English:** Uses AES-256-CBC encryption (with XOR fallback). Optionally encrypt workflow files on save. Encrypted files are portable across machines — just enter the correct password to decrypt

### 🎚️ 三级保护 | Three Protection Levels
| 级别 Level | 名称 Name | 说明 Description |
|:---:|:---:|---|
| 🔒 | 严格 Strict | 保护所有 API 和操作 / Protects all APIs and operations |
| 🔐 | 中等 Moderate | 仅保护敏感 API / Protects sensitive APIs only |
| 🔓 | 基础 Basic | 仅前端保护和日志记录 / Frontend protection and logging only |

### 📝 访问日志 | Access Logging
- **中文：** 记录所有授权尝试（成功/失败），包含时间戳和 IP 地址
- **English:** Logs all authorization attempts (success/failure) with timestamps and IP addresses

### ⏱️ 会话管理 | Session Management
- **中文：** 授权后获得 5 分钟临时令牌，到期后需重新验证。界面右下角显示倒计时徽章
- **English:** After authentication, a 5-minute session token is granted. A countdown badge appears in the bottom-right corner

---

## 📦 安装 | Installation

### 方法一：手动安装 | Method 1: Manual Install

```bash
cd ComfyUI/custom_nodes/
git clone https://github.com/your-repo/comfyui-workflow-protector.git
```

### 方法二：直接复制文件 | Method 2: Copy Files Directly

将插件文件放置在以下目录结构中：

Place the plugin files in the following directory structure:

```
ComfyUI/custom_nodes/comfyui-workflow-protector/
├── __init__.py              # 后端 Python 逻辑 / Backend Python logic
├── js/
│   └── workflow_protector.js  # 前端 JavaScript / Frontend JavaScript
└── README.md
```

### 安装依赖（推荐） | Install Dependencies (Recommended)

```bash
pip install cryptography
```

> **中文：** 如果未安装 `cryptography` 库，插件将使用内置 XOR 加密作为后备方案。推荐安装以获得 AES-256 加密强度。
>
> **English:** If the `cryptography` library is not installed, the plugin falls back to built-in XOR encryption. Installing it is recommended for AES-256 encryption strength.

---

## 🚀 使用指南 | Usage Guide

### 首次设置 | First-Time Setup

1. **中文：** 安装插件后启动 ComfyUI，界面右侧中央会出现 🛡️ 浮动按钮
2. **English:** After installation, launch ComfyUI. A 🛡️ floating button will appear on the right edge

3. **中文：** 点击浮动按钮打开设置面板，设置保护密码（至少 6 位）
4. **English:** Click the floating button to open the settings panel and set a protection password (minimum 6 characters)

### 日常使用 | Daily Use

#### 导出工作流时 | When Exporting Workflows
- **中文：** 保护启用后，任何导出操作都会弹出密码验证窗口，验证通过后获得 5 分钟操作窗口
- **English:** With protection enabled, any export action triggers a password prompt. After verification, you get a 5-minute operation window

#### 加密保存工作流 | Saving Encrypted Workflows
- **中文：** 保存工作流文件时，会弹出加密选项对话框。可选择设置加密密码（至少 4 位），也可选择不加密直接保存。加密后的文件名自动添加 `_encrypted` 后缀
- **English:** When saving a workflow file, an encryption dialog appears. You can set an encryption password (min. 4 chars) or skip encryption. Encrypted files are automatically suffixed with `_encrypted`

#### 打开加密工作流 | Opening Encrypted Workflows
- **中文：** 打开或拖入加密的 JSON 文件时，自动弹出解密密码输入框。成功解密后密码会被缓存，同一会话内再次打开无需重复输入
- **English:** When opening or dragging in an encrypted JSON file, a decryption prompt appears automatically. After successful decryption, the password is cached for the current session

### 设置面板 | Settings Panel

设置面板包含四个标签页 / The settings panel has four tabs:

| 标签 Tab | 功能 Function |
|---|---|
| 密码管理 Password | 设置、修改、清除保护密码 / Set, change, or clear password |
| 保护设置 Settings | 开关保护、设置保护级别 / Toggle protection, set protection level |
| 工具 Tools | 附加工具功能 / Additional tools |
| 访问日志 Logs | 查看和清除访问记录 / View and clear access logs |

---

## 🔧 技术细节 | Technical Details

### 安全机制 | Security Mechanisms

| 特性 Feature | 实现 Implementation |
|---|---|
| 密码存储 Password Storage | PBKDF2-HMAC-SHA256，100,000 次迭代 / 100k iterations |
| 密码盐值 Password Salt | 随机 128-bit 盐值 + 安装唯一密钥 / Random 128-bit salt + installation-unique key |
| 工作流加密 Workflow Encryption | AES-256-CBC（推荐）或 XOR 后备 / AES-256-CBC (recommended) or XOR fallback |
| 密钥派生 Key Derivation | PBKDF2，100,000 次迭代 / PBKDF2 with 100k iterations |
| 配置文件权限 Config Permissions | Unix 600（仅所有者可读写）/ Unix 600 (owner read/write only) |
| 防暴力破解 Brute-force Prevention | 验证失败延迟 2 秒 / 2-second delay on failed verification |
| 会话安全 Session Security | 令牌有效期 5 分钟，严格模式下绑定 IP / 5-min tokens, IP-bound in strict mode |

### 前端拦截层 | Frontend Interception Layers

- 键盘快捷键拦截 / Keyboard shortcut interception
- 剪贴板事件拦截 / Clipboard event interception
- 右键菜单拦截 / Context menu interception
- 拖拽事件拦截 / Drag-and-drop interception
- 文件保存拦截（`createElement('a')` / `saveAs` / Blob URL）/ File save interception
- 文件加载拦截（`FileReader` / `loadGraphData` / drop 事件）/ File load interception
- LiteGraph 内部方法拦截（`copyToClipboard` / `cloneSelection`）/ LiteGraph internal method interception
- MutationObserver 动态菜单监听 / Dynamic menu monitoring via MutationObserver

### 加密文件格式 | Encrypted File Format

加密后的 JSON 文件包含以下字段：

Encrypted JSON files contain the following fields:

```json
{
  "_protected": "COMFYUI_PROTECTED_WORKFLOW_V1",
  "_version": 1,
  "_cipher": "AES-CBC",
  "_salt": "...",
  "_iv": "...(base64)...",
  "_data": "...(base64 encrypted workflow)...",
  "_hint": "提示信息 / Hint message",
  "nodes": [{ "type": "Note", "widgets_values": ["⚠️ 此工作流已加密..."] }]
}
```

> **中文：** 加密文件内嵌一个 Note 节点作为占位，未安装插件的 ComfyUI 打开时会显示加密提示，而非报错。
>
> **English:** Encrypted files embed a placeholder Note node, so ComfyUI instances without the plugin display a friendly notice instead of an error.

---

## 🗂️ 文件结构 | File Structure

```
comfyui-workflow-protector/
├── __init__.py                # Python 后端：加密引擎、API 路由、会话管理、配置存储
│                              # Python backend: encryption engine, API routes,
│                              # session management, config storage
├── js/
│   └── workflow_protector.js  # JavaScript 前端：UI 界面、保护拦截、加密/解密交互
│                              # JS frontend: UI, protection interceptors,
│                              # encrypt/decrypt interaction
├── .wp_config                 # [自动生成] Base64 编码的配置文件
│                              # [Auto-generated] Base64-encoded config
├── .wp_key                    # [自动生成] 安装唯一加密密钥
│                              # [Auto-generated] Installation-unique encryption key
└── .wp_access.log             # [自动生成] 访问日志
                               # [Auto-generated] Access log
```

---

## ❓ 常见问题 | FAQ

**Q: 忘记了保护密码怎么办？/ What if I forget the protection password?**

> 删除插件目录下的 `.wp_config` 和 `.wp_key` 文件，重启 ComfyUI 即可重置。注意：此前加密的工作流仍需原加密密码才能解密。
>
> Delete `.wp_config` and `.wp_key` from the plugin directory and restart ComfyUI. Note: previously encrypted workflows still require their original encryption password.

**Q: 加密的工作流可以在其他电脑上解密吗？/ Can encrypted workflows be decrypted on other machines?**

> 可以，只要目标机器安装了本插件并且知道加密密码即可。加密采用便携模式，不绑定特定机器。
>
> Yes, as long as the target machine has this plugin installed and the encryption password is known. Encryption uses portable mode and is not machine-bound.

**Q: 未安装 `cryptography` 库会怎样？/ What happens without the `cryptography` library?**

> 插件将使用内置 XOR 加密作为后备方案，安全性较低但仍可正常工作。使用 XOR 加密的文件无法用 AES 解密，反之亦然。
>
> The plugin falls back to built-in XOR encryption, which is less secure but functional. XOR-encrypted files cannot be decrypted with AES and vice versa.

**Q: 保护能被绕过吗？/ Can the protection be bypassed?**

> 前端保护无法做到 100% 防御（有经验的用户可通过开发者工具绕过），但配合严格模式的后端 API 保护，可以有效阻止大多数未授权操作。工作流文件加密提供了真正的文件级安全保障。
>
> Frontend protection cannot be 100% tamper-proof (experienced users could bypass it via DevTools), but combined with strict-mode backend API protection, it effectively blocks most unauthorized operations. Workflow file encryption provides true file-level security.

---

## 📜 许可证 | License

MIT License

---

## 🙏 致谢 | Acknowledgments

- [ComfyUI](https://github.com/comfyanonymous/ComfyUI)
- [cryptography](https://pypi.org/project/cryptography/) (Python AES implementation)
