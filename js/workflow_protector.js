/**
 * ComfyUI Workflow Protector - 增强版 + 工作流加密
 * 提供多层保护机制防止未授权导出或复制
 * 支持工作流文件加密，防止未授权使用
 */

import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

// ==================== 全局状态 ====================

let currentToken = null;
let tokenExpiry = 0;
let protectionStatus = { has_password: false, enabled: false, protection_level: 'strict' };
let encryptionPassword = null; // 缓存的加密密码
let isDecryptingWorkflow = false; // 是否正在处理加密工作流解密

// ==================== 加密检测与操作 ====================

const MAGIC_HEADER = "COMFYUI_PROTECTED_WORKFLOW_V1";

// 检查是否是加密的工作流
function isEncryptedWorkflow(data) {
    return data && data._protected === MAGIC_HEADER;
}

// 调用后端加密API
async function encryptWorkflow(workflow, password) {
    try {
        const response = await fetch('/api/workflow_protector/encrypt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ workflow, password })
        });
        const result = await response.json();
        
        if (result.success) {
            return { success: true, encrypted: result.encrypted };
        } else {
            return { success: false, error: result.message };
        }
    } catch (e) {
        return { success: false, error: e.message };
    }
}

// 调用后端解密API
async function decryptWorkflow(encryptedWorkflow, password) {
    try {
        const response = await fetch('/api/workflow_protector/decrypt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ workflow: encryptedWorkflow, password })
        });
        const result = await response.json();
        
        if (result.success) {
            return { success: true, workflow: result.workflow };
        } else {
            return { success: false, error: result.message };
        }
    } catch (e) {
        return { success: false, error: e.message };
    }
}

// ==================== 加密密码输入对话框 ====================

function showEncryptionDialog(mode = 'decrypt', filename = '') {
    return new Promise((resolve) => {
        // 移除可能存在的旧对话框
        const existingOverlay = document.querySelector('.wp-encrypt-overlay');
        if (existingOverlay) existingOverlay.remove();
        
        const overlay = document.createElement('div');
        overlay.className = 'wp-overlay wp-encrypt-overlay';
        
        const isDecrypt = mode === 'decrypt';
        const title = isDecrypt ? '🔐 工作流已加密' : '🔒 加密保存工作流';
        const subtitle = isDecrypt 
            ? `文件: ${filename || '未知'}\n请输入密码以解密此工作流` 
            : '设置加密密码保护您的工作流\n加密后文件只能在本机使用';
        
        const dialog = document.createElement('div');
        dialog.className = 'wp-dialog';
        dialog.style.minWidth = '400px';
        dialog.innerHTML = `
            <div class="wp-title">
                <span>${title}</span>
            </div>
            <div style="color: #aaa; margin-bottom: 15px; white-space: pre-line; font-size: 13px;">${subtitle}</div>
            <div class="wp-message wp-encrypt-error"></div>
            <input type="password" class="wp-input wp-encrypt-pwd" placeholder="输入${isDecrypt ? '解密' : '加密'}密码" style="margin-bottom: 10px;">
            ${!isDecrypt ? '<input type="password" class="wp-input wp-encrypt-pwd-confirm" placeholder="确认密码" style="margin-bottom: 15px;">' : ''}
            <div class="wp-buttons" style="display: flex; gap: 10px;">
                <button class="wp-btn wp-btn-secondary wp-encrypt-cancel" style="flex: 1;">
                    ${isDecrypt ? '取消' : '不加密保存'}
                </button>
                <button class="wp-btn wp-btn-primary wp-encrypt-confirm" style="flex: 1;">
                    ${isDecrypt ? '解密并打开' : '加密保存'}
                </button>
            </div>
        `;
        
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);
        
        // 使用class在对话框内部查找元素，避免ID冲突
        const pwdInput = dialog.querySelector('.wp-encrypt-pwd');
        const confirmInput = dialog.querySelector('.wp-encrypt-pwd-confirm');
        const errorMsg = dialog.querySelector('.wp-encrypt-error');
        const confirmBtn = dialog.querySelector('.wp-encrypt-confirm');
        const cancelBtn = dialog.querySelector('.wp-encrypt-cancel');
        
        if (pwdInput) pwdInput.focus();
        
        // 清理函数 - 移除对话框和事件监听器
        let resolved = false;
        const cleanup = () => {
            document.removeEventListener('keydown', handleEsc);
            if (overlay.parentNode) {
                overlay.parentNode.removeChild(overlay);
            }
        };
        
        const doResolve = (result) => {
            if (resolved) return;
            resolved = true;
            cleanup();
            resolve(result);
        };
        
        // ESC事件处理器
        const handleEsc = (e) => {
            if (e.key === 'Escape') {
                doResolve({ password: null, cancelled: true, skipEncryption: !isDecrypt });
            }
        };
        document.addEventListener('keydown', handleEsc);
        
        const showError = (msg) => {
            if (errorMsg) {
                errorMsg.textContent = msg;
                errorMsg.classList.add('error');
                setTimeout(() => errorMsg.classList.remove('error'), 3000);
            }
        };
        
        if (confirmBtn) {
            confirmBtn.onclick = () => {
                const pwd = pwdInput ? pwdInput.value : '';
                
                if (!pwd) {
                    showError('请输入密码');
                    return;
                }
                
                if (!isDecrypt && confirmInput) {
                    const confirmPwd = confirmInput.value;
                    if (pwd !== confirmPwd) {
                        showError('两次密码不一致');
                        return;
                    }
                    if (pwd.length < 4) {
                        showError('密码至少4位');
                        return;
                    }
                }
                
                doResolve({ password: pwd, cancelled: false, skipEncryption: false });
            };
        }
        
        if (cancelBtn) {
            cancelBtn.onclick = () => {
                doResolve({ password: null, cancelled: true, skipEncryption: !isDecrypt });
            };
        }
        
        if (pwdInput) {
            pwdInput.onkeypress = (e) => {
                if (e.key === 'Enter') {
                    if (!isDecrypt && confirmInput) {
                        confirmInput.focus();
                    } else if (confirmBtn) {
                        confirmBtn.click();
                    }
                }
            };
        }
        
        if (confirmInput) {
            confirmInput.onkeypress = (e) => {
                if (e.key === 'Enter' && confirmBtn) confirmBtn.click();
            };
        }
        
        // 点击遮罩关闭
        overlay.onclick = (e) => {
            if (e.target === overlay) {
                doResolve({ password: null, cancelled: true, skipEncryption: !isDecrypt });
            }
        };
    });
}

// ==================== 样式定义 ====================

const styles = `
    .wp-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.85);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 999999;
        backdrop-filter: blur(5px);
    }
    .wp-dialog {
        background: linear-gradient(145deg, #2d2d2d, #1a1a1a);
        border-radius: 16px;
        padding: 28px;
        min-width: 360px;
        max-width: 450px;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255,255,255,0.1);
    }
    .wp-title {
        color: #fff;
        font-size: 20px;
        font-weight: 600;
        margin-bottom: 20px;
        display: flex;
        align-items: center;
        gap: 10px;
    }
    .wp-title-icon {
        width: 32px;
        height: 32px;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        border-radius: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 18px;
    }
    .wp-input {
        width: 100%;
        padding: 12px 16px;
        border: 2px solid #404040;
        border-radius: 10px;
        background: #1a1a1a;
        color: #fff;
        font-size: 15px;
        margin-bottom: 16px;
        box-sizing: border-box;
        transition: all 0.2s;
    }
    .wp-input:focus {
        outline: none;
        border-color: #667eea;
        box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.2);
    }
    .wp-input::placeholder {
        color: #666;
    }
    .wp-buttons {
        display: flex;
        gap: 12px;
        justify-content: flex-end;
        margin-top: 8px;
    }
    .wp-btn {
        padding: 10px 24px;
        border-radius: 10px;
        border: none;
        cursor: pointer;
        font-size: 14px;
        font-weight: 500;
        transition: all 0.2s;
    }
    .wp-btn-primary {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: #fff;
    }
    .wp-btn-primary:hover {
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
    }
    .wp-btn-secondary {
        background: #404040;
        color: #fff;
    }
    .wp-btn-secondary:hover {
        background: #505050;
    }
    .wp-btn-danger {
        background: linear-gradient(135deg, #f5576c 0%, #f093fb 100%);
        color: #fff;
    }
    .wp-btn-danger:hover {
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(245, 87, 108, 0.4);
    }
    .wp-message {
        padding: 10px 14px;
        border-radius: 8px;
        font-size: 13px;
        margin-bottom: 16px;
        display: none;
    }
    .wp-message.error {
        display: block;
        background: rgba(245, 87, 108, 0.15);
        border: 1px solid rgba(245, 87, 108, 0.3);
        color: #f5576c;
    }
    .wp-message.success {
        display: block;
        background: rgba(46, 204, 113, 0.15);
        border: 1px solid rgba(46, 204, 113, 0.3);
        color: #2ecc71;
    }
    .wp-label {
        color: #aaa;
        font-size: 13px;
        margin-bottom: 8px;
        font-weight: 500;
    }
    .wp-section {
        margin-bottom: 20px;
        padding-bottom: 20px;
        border-bottom: 1px solid #333;
    }
    .wp-section:last-of-type {
        border-bottom: none;
        margin-bottom: 0;
        padding-bottom: 0;
    }
    .wp-status-card {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 14px;
        background: #1a1a1a;
        border-radius: 10px;
        margin-bottom: 20px;
    }
    .wp-status-dot {
        width: 12px;
        height: 12px;
        border-radius: 50%;
        flex-shrink: 0;
    }
    .wp-status-dot.active {
        background: #2ecc71;
        box-shadow: 0 0 8px rgba(46, 204, 113, 0.5);
    }
    .wp-status-dot.inactive {
        background: #e74c3c;
        box-shadow: 0 0 8px rgba(231, 76, 60, 0.5);
    }
    .wp-status-dot.warning {
        background: #f39c12;
        box-shadow: 0 0 8px rgba(243, 156, 18, 0.5);
    }
    .wp-status-text {
        color: #ccc;
        font-size: 13px;
    }
    .wp-status-text strong {
        color: #fff;
    }
    .wp-level-select {
        display: flex;
        gap: 8px;
        margin-bottom: 16px;
    }
    .wp-level-btn {
        flex: 1;
        padding: 10px;
        border: 2px solid #404040;
        border-radius: 8px;
        background: #1a1a1a;
        color: #aaa;
        cursor: pointer;
        transition: all 0.2s;
        font-size: 12px;
        text-align: center;
    }
    .wp-level-btn:hover {
        border-color: #667eea;
        color: #fff;
    }
    .wp-level-btn.active {
        border-color: #667eea;
        background: rgba(102, 126, 234, 0.15);
        color: #667eea;
    }
    .wp-tabs {
        display: flex;
        gap: 4px;
        margin-bottom: 20px;
        background: #1a1a1a;
        padding: 4px;
        border-radius: 10px;
    }
    .wp-tab {
        flex: 1;
        padding: 10px;
        border: none;
        border-radius: 8px;
        background: transparent;
        color: #888;
        cursor: pointer;
        transition: all 0.2s;
        font-size: 13px;
        font-weight: 500;
    }
    .wp-tab:hover {
        color: #fff;
    }
    .wp-tab.active {
        background: #333;
        color: #fff;
    }
    .wp-tab-content {
        display: none;
    }
    .wp-tab-content.active {
        display: block;
    }
    .wp-log-container {
        max-height: 200px;
        overflow-y: auto;
        background: #0d0d0d;
        border-radius: 8px;
        padding: 10px;
        font-family: monospace;
        font-size: 11px;
        color: #888;
    }
    .wp-log-entry {
        padding: 4px 0;
        border-bottom: 1px solid #1a1a1a;
    }
    .wp-log-entry:last-child {
        border-bottom: none;
    }
    .wp-authorized-badge {
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: linear-gradient(135deg, #2ecc71 0%, #27ae60 100%);
        color: #fff;
        padding: 8px 16px;
        border-radius: 20px;
        font-size: 12px;
        font-weight: 500;
        display: flex;
        align-items: center;
        gap: 6px;
        z-index: 99998;
        box-shadow: 0 4px 12px rgba(46, 204, 113, 0.4);
        cursor: pointer;
        transition: all 0.2s;
    }
    .wp-authorized-badge:hover {
        transform: scale(1.05);
    }
    .wp-lock-screen {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.95);
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        z-index: 999999;
    }
    .wp-lock-icon {
        font-size: 64px;
        margin-bottom: 24px;
    }
    .wp-lock-title {
        color: #fff;
        font-size: 24px;
        font-weight: 600;
        margin-bottom: 12px;
    }
    .wp-lock-subtitle {
        color: #888;
        font-size: 14px;
        margin-bottom: 32px;
    }
`;

// 注入样式
const styleEl = document.createElement('style');
styleEl.textContent = styles;
document.head.appendChild(styleEl);

// ==================== 工具函数 ====================

async function fetchStatus() {
    try {
        const response = await fetch('/api/workflow_protector/status');
        const newStatus = await response.json();
        protectionStatus = newStatus;
        return protectionStatus;
    } catch (e) {
        console.error('[Workflow Protector] 获取状态失败:', e);
        return protectionStatus;
    }
}

function isAuthorized() {
    // 如果正在解密工作流，临时授权
    if (isDecryptingWorkflow) {
        return true;
    }
    if (!protectionStatus.has_password || !protectionStatus.enabled) {
        return true;
    }
    return currentToken && Date.now() < tokenExpiry;
}

function setToken(token, expiresIn) {
    currentToken = token;
    tokenExpiry = Date.now() + (expiresIn * 1000);
    updateAuthBadge();
}

function clearToken() {
    currentToken = null;
    tokenExpiry = 0;
    updateAuthBadge();
}

// ==================== 授权状态徽章 ====================

let authBadge = null;

function updateAuthBadge() {
    if (!protectionStatus.has_password || !protectionStatus.enabled) {
        if (authBadge) authBadge.remove();
        return;
    }
    
    if (isAuthorized()) {
        if (!authBadge) {
            authBadge = document.createElement('div');
            authBadge.className = 'wp-authorized-badge';
            authBadge.onclick = () => showSettingsDialog();
            document.body.appendChild(authBadge);
        }
        const remaining = Math.ceil((tokenExpiry - Date.now()) / 1000);
        const mins = Math.floor(remaining / 60);
        const secs = remaining % 60;
        authBadge.innerHTML = `🔓 已授权 (${mins}:${secs.toString().padStart(2, '0')})`;
    } else {
        if (authBadge) {
            authBadge.remove();
            authBadge = null;
        }
    }
}

// 定时更新徽章
setInterval(updateAuthBadge, 1000);

// ==================== 锁屏界面 ====================

let lockScreen = null;

function showLockScreen() {
    if (lockScreen) return;
    
    lockScreen = document.createElement('div');
    lockScreen.className = 'wp-lock-screen';
    lockScreen.innerHTML = `
        <div class="wp-lock-icon">🔒</div>
        <div class="wp-lock-title">工作流保护已启用</div>
        <div class="wp-lock-subtitle">请输入密码以继续使用 ComfyUI</div>
        <input type="password" class="wp-input" id="wp-lock-password" placeholder="输入保护密码" style="width: 280px;">
        <div class="wp-message" id="wp-lock-error"></div>
        <button class="wp-btn wp-btn-primary" id="wp-lock-submit" style="width: 280px; margin-top: 8px;">解锁</button>
    `;
    document.body.appendChild(lockScreen);
    
    const input = document.getElementById('wp-lock-password');
    const error = document.getElementById('wp-lock-error');
    const submit = document.getElementById('wp-lock-submit');
    
    input.focus();
    
    const doUnlock = async () => {
        const password = input.value;
        try {
            const response = await fetch('/api/workflow_protector/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password })
            });
            const result = await response.json();
            
            if (result.success) {
                setToken(result.token, result.expires_in || 300);
                lockScreen.remove();
                lockScreen = null;
            } else {
                error.textContent = result.message;
                error.classList.add('error');
                input.value = '';
                input.focus();
            }
        } catch (e) {
            error.textContent = '验证失败: ' + e.message;
            error.classList.add('error');
        }
    };
    
    submit.onclick = doUnlock;
    input.onkeypress = (e) => { if (e.key === 'Enter') doUnlock(); };
}

function hideLockScreen() {
    if (lockScreen) {
        lockScreen.remove();
        lockScreen = null;
    }
}

// ==================== 密码验证对话框 ====================

function showPasswordDialog(action) {
    // 如果正在解密工作流，跳过API保护检查
    if (isDecryptingWorkflow) {
        console.log('[Workflow Protector] 正在解密工作流，跳过API保护');
        return Promise.resolve(true);
    }
    
    return new Promise((resolve) => {
        const actionTexts = {
            'export': '导出/另存为',
            'copy': '复制节点',
            'cut': '剪切节点',
            'duplicate': '复制/克隆节点',
            'saveas': '另存为',
            'template': '保存模板',
            'save': '保存工作流',
            'api': '访问API',
            'general': '执行此操作'
        };
        
        const overlay = document.createElement('div');
        overlay.className = 'wp-overlay';
        
        const dialog = document.createElement('div');
        dialog.className = 'wp-dialog';
        dialog.innerHTML = `
            <div class="wp-title">
                <div class="wp-title-icon">🔐</div>
                <span>需要授权</span>
            </div>
            <div class="wp-message" id="wp-verify-error"></div>
            <div class="wp-label">请输入密码以${actionTexts[action] || action}：</div>
            <input type="password" class="wp-input" id="wp-verify-password" placeholder="输入保护密码">
            <div class="wp-buttons">
                <button class="wp-btn wp-btn-secondary" id="wp-verify-cancel">取消</button>
                <button class="wp-btn wp-btn-primary" id="wp-verify-confirm">验证</button>
            </div>
        `;
        
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);
        
        const input = document.getElementById('wp-verify-password');
        const error = document.getElementById('wp-verify-error');
        const confirmBtn = document.getElementById('wp-verify-confirm');
        const cancelBtn = document.getElementById('wp-verify-cancel');
        
        input.focus();
        
        let cleaned = false;
        const cleanup = () => {
            if (cleaned) return;
            cleaned = true;
            if (overlay.parentNode) {
                overlay.parentNode.removeChild(overlay);
            }
        };
        
        const verify = async () => {
            const password = input.value;
            if (!password) {
                error.textContent = '请输入密码';
                error.classList.add('error');
                return;
            }
            
            try {
                // 直接使用原生fetch，避免被拦截
                const response = await fetch('/api/workflow_protector/verify', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ password })
                });
                const result = await response.json();
                
                if (result.success) {
                    setToken(result.token, result.expires_in || 300);
                    cleanup();
                    resolve(true);
                } else {
                    error.textContent = result.message || '密码错误';
                    error.classList.add('error');
                    input.value = '';
                    input.focus();
                }
            } catch (e) {
                console.error('[Workflow Protector] 验证请求失败:', e);
                error.textContent = '验证失败: ' + e.message;
                error.classList.add('error');
            }
        };
        
        confirmBtn.onclick = verify;
        cancelBtn.onclick = () => { cleanup(); resolve(false); };
        input.onkeypress = (e) => { if (e.key === 'Enter') verify(); };
        overlay.onclick = (e) => { if (e.target === overlay) { cleanup(); resolve(false); } };
    });
}

// ==================== 设置对话框 ====================

async function showSettingsDialog() {
    const status = await fetchStatus();
    
    const overlay = document.createElement('div');
    overlay.className = 'wp-overlay';
    
    const dialog = document.createElement('div');
    dialog.className = 'wp-dialog';
    dialog.style.minWidth = '420px';
    
    const statusDot = status.has_password && status.enabled ? 'active' : 
                      status.has_password ? 'warning' : 'inactive';
    const statusText = status.has_password ? 
                       (status.enabled ? '保护已启用' : '保护已禁用') : '未设置密码';
    
    const levelNames = { strict: '严格', moderate: '中等', basic: '基础' };
    
    dialog.innerHTML = `
        <div class="wp-title">
            <div class="wp-title-icon">🛡️</div>
            <span>工作流保护设置</span>
        </div>
        
        <div class="wp-status-card">
            <div class="wp-status-dot ${statusDot}"></div>
            <div class="wp-status-text">
                <strong>${statusText}</strong><br>
                保护级别: ${levelNames[status.protection_level] || '严格'} | 
                活跃会话: ${status.active_sessions || 0}
            </div>
        </div>
        
        <div class="wp-message" id="wp-settings-msg"></div>
        
        ${status.has_password ? `
        <div class="wp-tabs">
            <button class="wp-tab active" data-tab="password">密码管理</button>
            <button class="wp-tab" data-tab="settings">保护设置</button>
            <button class="wp-tab" data-tab="tools">工具</button>
            <button class="wp-tab" data-tab="logs">访问日志</button>
        </div>
        ` : ''}
        
        <div class="wp-tab-content active" id="tab-password">
            <div class="wp-section">
                <div class="wp-label">${status.has_password ? '修改密码' : '设置保护密码'}</div>
                ${status.has_password ? '<input type="password" class="wp-input" id="wp-old-pwd" placeholder="输入原密码">' : ''}
                <input type="password" class="wp-input" id="wp-new-pwd" placeholder="输入新密码">
                <input type="password" class="wp-input" id="wp-confirm-pwd" placeholder="确认新密码">
                <button class="wp-btn wp-btn-primary" id="wp-set-pwd" style="width:100%">
                    ${status.has_password ? '修改密码' : '设置密码'}
                </button>
            </div>
            
            ${status.has_password ? `
            <div class="wp-section">
                <div class="wp-label">清除密码保护</div>
                <input type="password" class="wp-input" id="wp-clear-pwd" placeholder="输入当前密码确认">
                <button class="wp-btn wp-btn-danger" id="wp-clear" style="width:100%">清除密码</button>
            </div>
            ` : ''}
        </div>
        
        ${status.has_password ? `
        <div class="wp-tab-content" id="tab-settings">
            <div class="wp-section">
                <div class="wp-label">保护开关</div>
                <input type="password" class="wp-input" id="wp-toggle-pwd" placeholder="输入密码">
                <div style="display:flex;gap:10px">
                    <button class="wp-btn ${status.enabled ? 'wp-btn-secondary' : 'wp-btn-primary'}" id="wp-enable" style="flex:1">
                        启用保护
                    </button>
                    <button class="wp-btn ${status.enabled ? 'wp-btn-danger' : 'wp-btn-secondary'}" id="wp-disable" style="flex:1">
                        禁用保护
                    </button>
                </div>
            </div>
            
            <div class="wp-section">
                <div class="wp-label">保护级别</div>
                <input type="password" class="wp-input" id="wp-level-pwd" placeholder="输入密码">
                <div class="wp-level-select">
                    <button class="wp-level-btn ${status.protection_level === 'strict' ? 'active' : ''}" data-level="strict">
                        🔒 严格<br><small>保护所有API</small>
                    </button>
                    <button class="wp-level-btn ${status.protection_level === 'moderate' ? 'active' : ''}" data-level="moderate">
                        🔐 中等<br><small>保护敏感API</small>
                    </button>
                    <button class="wp-level-btn ${status.protection_level === 'basic' ? 'active' : ''}" data-level="basic">
                        🔓 基础<br><small>仅前端保护</small>
                    </button>
                </div>
            </div>
        </div>
        
        <div class="wp-tab-content" id="tab-logs">
            <div class="wp-section">
                <div class="wp-label">最近访问记录</div>
                <div class="wp-log-container" id="wp-logs">加载中...</div>
                <button class="wp-btn wp-btn-secondary" id="wp-refresh-logs" style="width:100%;margin-top:10px">刷新日志</button>
                <button class="wp-btn wp-btn-danger" id="wp-clear-logs" style="width:100%;margin-top:8px">清除日志</button>
            </div>
        </div>
        ` : ''}
        
        <div class="wp-buttons" style="margin-top:20px">
            <button class="wp-btn wp-btn-secondary" id="wp-close">关闭</button>
        </div>
    `;
    
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    
    const msg = document.getElementById('wp-settings-msg');
    
    const showMsg = (text, isError = true) => {
        msg.textContent = text;
        msg.className = `wp-message ${isError ? 'error' : 'success'}`;
        setTimeout(() => msg.className = 'wp-message', 3000);
    };
    
    const cleanup = () => document.body.removeChild(overlay);
    
    // 日志加载函数（提前定义，避免引用错误）
    const loadLogs = async () => {
        const container = document.getElementById('wp-logs');
        if (!container) return;
        try {
            const resp = await fetch('/api/workflow_protector/logs', {
                headers: { 'X-WP-Token': currentToken }
            });
            const result = await resp.json();
            
            if (result.success && result.logs.length > 0) {
                container.innerHTML = result.logs.reverse().map(log => 
                    `<div class="wp-log-entry">${log}</div>`
                ).join('');
            } else {
                container.innerHTML = '<div style="color:#666;text-align:center">暂无日志</div>';
            }
        } catch (e) {
            container.innerHTML = '<div style="color:#f5576c">加载失败，请先验证授权</div>';
        }
    };
    
    // 标签页切换
    dialog.querySelectorAll('.wp-tab').forEach(tab => {
        tab.onclick = () => {
            dialog.querySelectorAll('.wp-tab').forEach(t => t.classList.remove('active'));
            dialog.querySelectorAll('.wp-tab-content').forEach(c => c.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
            
            if (tab.dataset.tab === 'logs') loadLogs();
        };
    });
    
    // 设置密码
    document.getElementById('wp-set-pwd').onclick = async () => {
        const oldPwd = document.getElementById('wp-old-pwd')?.value || '';
        const newPwd = document.getElementById('wp-new-pwd').value;
        const confirmPwd = document.getElementById('wp-confirm-pwd').value;
        
        if (!newPwd) return showMsg('请输入新密码');
        if (newPwd.length < 6) return showMsg('密码长度至少6位');
        if (newPwd !== confirmPwd) return showMsg('两次密码不一致');
        
        try {
            const resp = await fetch('/api/workflow_protector/set_password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ old_password: oldPwd, new_password: newPwd })
            });
            
            const result = await resp.json();
            
            if (result.success) {
                showMsg(result.message, false);
                clearToken();
                
                // 等待后端处理完成
                await new Promise(r => setTimeout(r, 300));
                
                // 更新全局状态
                protectionStatus = await fetchStatus();
                
                setTimeout(() => { 
                    cleanup(); 
                    showSettingsDialog(); 
                }, 300);
            } else {
                showMsg(result.message);
            }
        } catch (e) {
            console.error('[Workflow Protector] 设置密码异常:', e);
            showMsg('操作失败: ' + e.message);
        }
    };
    
    // 清除密码
    if (status.has_password) {
        document.getElementById('wp-clear').onclick = async () => {
            const pwd = document.getElementById('wp-clear-pwd').value;
            
            try {
                const resp = await fetch('/api/workflow_protector/clear_password', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ password: pwd })
                });
                const result = await resp.json();
                
                if (result.success) {
                    showMsg(result.message, false);
                    clearToken();
                    // 立即更新全局状态
                    protectionStatus = await fetchStatus();
                    console.log('[Workflow Protector] 密码已清除，当前状态:', protectionStatus);
                    setTimeout(() => { cleanup(); showSettingsDialog(); }, 800);
                } else {
                    showMsg(result.message);
                }
            } catch (e) {
                showMsg('操作失败: ' + e.message);
            }
        };
        
        // 启用/禁用
        document.getElementById('wp-enable').onclick = async () => {
            const pwd = document.getElementById('wp-toggle-pwd').value;
            try {
                const resp = await fetch('/api/workflow_protector/toggle', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ password: pwd, enabled: true })
                });
                const result = await resp.json();
                result.success ? (showMsg(result.message, false), setTimeout(() => { cleanup(); showSettingsDialog(); }, 1000)) : showMsg(result.message);
            } catch (e) { showMsg('操作失败'); }
        };
        
        document.getElementById('wp-disable').onclick = async () => {
            const pwd = document.getElementById('wp-toggle-pwd').value;
            try {
                const resp = await fetch('/api/workflow_protector/toggle', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ password: pwd, enabled: false })
                });
                const result = await resp.json();
                result.success ? (showMsg(result.message, false), setTimeout(() => { cleanup(); showSettingsDialog(); }, 1000)) : showMsg(result.message);
            } catch (e) { showMsg('操作失败'); }
        };
        
        // 保护级别
        dialog.querySelectorAll('.wp-level-btn').forEach(btn => {
            btn.onclick = async () => {
                const pwd = document.getElementById('wp-level-pwd').value;
                const level = btn.dataset.level;
                
                try {
                    const resp = await fetch('/api/workflow_protector/set_level', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ password: pwd, level })
                    });
                    const result = await resp.json();
                    
                    if (result.success) {
                        showMsg(result.message, false);
                        dialog.querySelectorAll('.wp-level-btn').forEach(b => b.classList.remove('active'));
                        btn.classList.add('active');
                    } else {
                        showMsg(result.message);
                    }
                } catch (e) { showMsg('操作失败'); }
            };
        });
        
        // 日志按钮绑定
        document.getElementById('wp-refresh-logs').onclick = loadLogs;
        document.getElementById('wp-clear-logs').onclick = async () => {
            try {
                await fetch('/api/workflow_protector/clear_logs', {
                    method: 'POST',
                    headers: { 'X-WP-Token': currentToken }
                });
                loadLogs();
            } catch (e) { showMsg('清除失败'); }
        };
    }
    
    // 关闭
    document.getElementById('wp-close').onclick = cleanup;
    overlay.onclick = (e) => { if (e.target === overlay) cleanup(); };
}

// ==================== API拦截 ====================

// 注意：不再拦截API路径，因为会在页面加载时触发
// 保护通过前端操作拦截实现（键盘快捷键、右键菜单、文件保存）

// 保持原始fetch引用，用于插件自身的API调用
const originalFetch = window.fetch;

// ==================== 键盘和剪贴板拦截 ====================

// 需要保护的快捷键列表
const PROTECTED_KEYS = [
    { key: 'c', ctrl: true, action: 'copy', desc: '复制' },
    { key: 'x', ctrl: true, action: 'cut', desc: '剪切' },
    { key: 'd', ctrl: true, action: 'duplicate', desc: '复制节点' },
    { key: 'e', ctrl: true, shift: true, action: 'export', desc: '导出' },
    { key: 'e', ctrl: true, action: 'export', desc: '导出' },
    { key: 's', ctrl: true, shift: true, action: 'saveas', desc: '另存为' },
];

// 标记是否正在显示密码对话框
let isShowingPasswordDialog = false;

// 拦截键盘事件 - 使用缓存状态进行同步检查
document.addEventListener('keydown', (e) => {
    // 使用缓存的状态进行同步检查（避免异步问题）
    if (!protectionStatus.has_password || !protectionStatus.enabled) return;
    if (isAuthorized()) return;
    if (isShowingPasswordDialog) return;
    
    // 检查是否匹配保护的快捷键
    for (const pk of PROTECTED_KEYS) {
        const ctrlMatch = pk.ctrl ? (e.ctrlKey || e.metaKey) : true;
        const shiftMatch = pk.shift ? e.shiftKey : (pk.shift === false ? !e.shiftKey : true);
        const keyMatch = e.key.toLowerCase() === pk.key;
        
        if (ctrlMatch && shiftMatch && keyMatch) {
            // 对于复制/剪切/复制节点，需要检查是否选中了节点
            if (['copy', 'cut', 'duplicate'].includes(pk.action)) {
                const hasSelectedNodes = app.canvas?.selected_nodes && Object.keys(app.canvas.selected_nodes).length > 0;
                if (!hasSelectedNodes) continue;
            }
            
            // 立即阻止事件
            e.preventDefault();
            e.stopImmediatePropagation();
            e.stopPropagation();
            
            // 异步显示密码对话框
            isShowingPasswordDialog = true;
            showPasswordDialog(pk.action).then(authorized => {
                isShowingPasswordDialog = false;
                if (authorized) {
                    // 授权后重新触发操作
                    console.log('[Workflow Protector] 授权成功，执行:', pk.action);
                    if (pk.action === 'copy') {
                        document.execCommand('copy');
                    } else if (pk.action === 'cut') {
                        document.execCommand('cut');
                    } else if (pk.action === 'duplicate' && app.canvas?.cloneSelection) {
                        app.canvas.cloneSelection();
                    }
                }
            });
            
            return false;
        }
    }
}, true);

// 拦截 copy 和 cut 事件
['copy', 'cut'].forEach(eventType => {
    document.addEventListener(eventType, (e) => {
        // 使用缓存状态
        if (!protectionStatus.has_password || !protectionStatus.enabled) return;
        if (isAuthorized()) return;
        
        // 检查是否选中了节点
        const hasSelectedNodes = app.canvas?.selected_nodes && Object.keys(app.canvas.selected_nodes).length > 0;
        if (!hasSelectedNodes) return;
        
        e.preventDefault();
        e.stopImmediatePropagation();
    }, true);
});

// ==================== 拖拽保护 ====================

// 拦截拖拽事件（防止拖拽节点到外部）
document.addEventListener('dragstart', (e) => {
    if (!protectionStatus.has_password || !protectionStatus.enabled) return;
    if (isAuthorized()) return;
    
    // 检查是否在画布区域拖拽
    const isCanvasArea = e.target.closest('canvas') || e.target.closest('.litegraph');
    if (isCanvasArea) {
        e.preventDefault();
        e.stopImmediatePropagation();
        showPasswordDialog('export');
    }
}, true);

// ==================== 右键菜单拦截 ====================

// 需要保护的菜单关键词
const PROTECTED_MENU_WORDS = [
    // 英文
    'export', 'copy', 'cut', 'clone', 'duplicate', 'clipboard', 
    'save as', 'save to', 'template', 'group', 'pack', 'share',
    // 中文
    '导出', '复制', '剪切', '克隆', '重复', '另存为', '另存',
    '模板', '分组', '打包', '分享', '拷贝'
];

// 排除词（普通保存）
const EXCLUDED_WORDS = ['save workflow', '保存工作流', 'save project'];

document.addEventListener('contextmenu', () => {
    setTimeout(async () => {
        const status = await fetchStatus();
        if (!status.has_password || !status.enabled) return;
        
        // 查找所有可能的菜单项
        const menuSelectors = [
            '.litecontextmenu .litemenu-entry',
            '.comfy-context-menu-item',
            '[class*="context-menu"] [class*="item"]',
            '[class*="menu"] [class*="item"]',
            '[class*="dropdown"] [class*="item"]',
            '[role="menuitem"]',
            '.p-menuitem',
            '.menu-item'
        ];
        
        const menuItems = document.querySelectorAll(menuSelectors.join(', '));
        
        menuItems.forEach(item => {
            const text = (item.textContent || '').toLowerCase();
            
            // 检查是否匹配保护词
            const isProtectedAction = PROTECTED_MENU_WORDS.some(w => text.includes(w.toLowerCase()));
            
            // 检查是否是排除词
            const isExcluded = EXCLUDED_WORDS.some(w => text.includes(w.toLowerCase()));
            
            // 特殊处理：只有"save"不保护，但"save as"要保护
            const isSaveOnly = (text.includes('save') || text.includes('保存')) && 
                              !text.includes('save as') && !text.includes('另存') &&
                              !text.includes('save to') && !text.includes('template');
            
            if (isProtectedAction && !isExcluded && !isSaveOnly) {
                // 保存原始的onclick
                const originalOnclick = item.onclick;
                
                // 替换onclick
                item.onclick = async (e) => {
                    if (!isAuthorized()) {
                        e.preventDefault();
                        e.stopPropagation();
                        e.stopImmediatePropagation();
                        
                        const authorized = await showPasswordDialog('export');
                        if (!authorized) {
                            return false;
                        }
                    }
                    // 授权后执行原始操作
                    if (originalOnclick) {
                        originalOnclick.call(item, e);
                    }
                };
                
                // 也添加click事件监听器（有些菜单可能用addEventListener而不是onclick）
                item.addEventListener('click', async (e) => {
                    if (!isAuthorized()) {
                        e.preventDefault();
                        e.stopPropagation();
                        e.stopImmediatePropagation();
                        
                        await showPasswordDialog('export');
                        return false;
                    }
                }, true);
            }
        });
    }, 50);
}, true);

// 持续监听菜单（有些菜单是动态生成的）
setInterval(() => {
    // 使用缓存状态
    if (!protectionStatus.has_password || !protectionStatus.enabled) return;
    if (isAuthorized()) return;
    
    const visibleMenus = document.querySelectorAll('.litecontextmenu, [class*="context-menu"]:not([style*="display: none"])');
    if (visibleMenus.length === 0) return;
    
    visibleMenus.forEach(menu => {
        if (menu._wpProtected) return;
        menu._wpProtected = true;
        
        menu.querySelectorAll('.litemenu-entry, [class*="item"]').forEach(item => {
            const text = (item.textContent || '').toLowerCase();
            const isProtected = PROTECTED_MENU_WORDS.some(w => text.includes(w.toLowerCase()));
            const isSaveOnly = text.includes('save') && !text.includes('save as') && !text.includes('另存');
            
            if (isProtected && !isSaveOnly && !item._wpHandler) {
                item._wpHandler = true;
                item.addEventListener('click', async (e) => {
                    if (!isAuthorized()) {
                        e.preventDefault();
                        e.stopPropagation();
                        e.stopImmediatePropagation();
                        await showPasswordDialog('export');
                        return false;
                    }
                }, true);
            }
        });
    });
}, 200);

// ==================== 拦截ComfyUI原生导出功能 ====================

// 注意：导出拦截已整合到 interceptFileSave() 中，
// 不再在此处单独覆写 document.createElement，避免双重 async 包装导致下载失败

// 拦截 Blob URL 创建（工作流导出前的步骤）
const originalCreateObjectURL = URL.createObjectURL.bind(URL);
URL.createObjectURL = function(blob) {
    const url = originalCreateObjectURL(blob);
    
    // 检查是否是JSON类型的Blob（可能是工作流）
    if (blob && (blob.type === 'application/json' || blob.type === 'text/json')) {
        // 记录这个URL，可能是工作流
        console.log('[Workflow Protector] 检测到JSON Blob创建');
    }
    
    return url;
};

// 拦截 saveAs / FileSaver
if (typeof saveAs !== 'undefined') {
    const originalSaveAs = saveAs;
    window.saveAs = function(blob, filename) {
        // 同步快速路径：无保护时直接保存
        if (!protectionStatus.has_password || !protectionStatus.enabled) {
            return originalSaveAs(blob, filename);
        }
        if (isAuthorized()) {
            return originalSaveAs(blob, filename);
        }
        if (filename && (filename.endsWith('.json') || filename.includes('workflow'))) {
            (async () => {
                const authorized = await showPasswordDialog('export');
                if (!authorized) {
                    console.log('[Workflow Protector] saveAs 被阻止');
                    return;
                }
                originalSaveAs(blob, filename);
            })();
        } else {
            return originalSaveAs(blob, filename);
        }
    };
}

// 监听并拦截动态创建的下载链接
const downloadObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
            if (node.nodeType === 1 && node.tagName === 'A' && node.download) {
                // 跳过bypass标记的链接
                if (node._wpBypass) return;
                
                const download = node.download || '';
                if (download.endsWith('.json') || download.includes('workflow')) {
                    const originalClick = node.click.bind(node);
                    node.click = function() {
                        // 同步快速路径：无保护时直接点击
                        if (!protectionStatus.has_password || !protectionStatus.enabled) {
                            return originalClick();
                        }
                        if (isAuthorized()) {
                            return originalClick();
                        }
                        (async () => {
                            const authorized = await showPasswordDialog('export');
                            if (!authorized) return;
                            originalClick();
                        })();
                    };
                }
            }
        });
    });
});

downloadObserver.observe(document.body, { childList: true, subtree: true });

// ==================== 监听动态菜单 ====================

// 使用 MutationObserver 监听菜单创建
const menuObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
        mutation.addedNodes.forEach(async (node) => {
            if (node.nodeType !== 1) return;
            
            const status = await fetchStatus();
            if (!status.has_password || !status.enabled) return;
            
            // 查找所有可能的菜单项
            const items = node.querySelectorAll ? 
                node.querySelectorAll('[class*="menu"] button, [class*="menu"] [role="menuitem"], .litemenu-entry, [class*="dropdown"] button, .p-menuitem-link') : [];
            
            items.forEach(item => {
                if (item._wpObserved) return;
                item._wpObserved = true;
                
                const text = (item.textContent || '').toLowerCase();
                
                // 检查是否需要保护
                const isProtected = PROTECTED_MENU_WORDS.some(w => text.includes(w.toLowerCase()));
                const isSaveOnly = text.includes('save') && !text.includes('save as') && !text.includes('另存');
                
                if (isProtected && !isSaveOnly) {
                    item.addEventListener('click', async (e) => {
                        if (!isAuthorized()) {
                            e.preventDefault();
                            e.stopPropagation();
                            e.stopImmediatePropagation();
                            
                            const authorized = await showPasswordDialog('export');
                            if (!authorized) {
                                return false;
                            }
                        }
                    }, true);
                }
            });
        });
    });
});

menuObserver.observe(document.body, { childList: true, subtree: true });

// ==================== 拦截 LiteGraph 内部方法 ====================

// 等待 app 加载完成后拦截内部方法
const interceptLiteGraph = () => {
    if (!app.canvas) {
        setTimeout(interceptLiteGraph, 500);
        return;
    }
    
    const canvas = app.canvas;
    
    // 拦截 copyToClipboard
    if (canvas.copyToClipboard) {
        const originalCopy = canvas.copyToClipboard.bind(canvas);
        canvas.copyToClipboard = async function(nodes) {
            const status = await fetchStatus();
            if (status.has_password && status.enabled && !isAuthorized()) {
                const authorized = await showPasswordDialog('copy');
                if (!authorized) return;
            }
            return originalCopy(nodes);
        };
    }
    
    // 拦截 pasteFromClipboard（粘贴时检查来源）
    // 注意：粘贴本身不需要保护，但可以记录
    
    // 拦截 cloneSelection（Ctrl+D）
    if (canvas.cloneSelection) {
        const originalClone = canvas.cloneSelection.bind(canvas);
        canvas.cloneSelection = async function() {
            const status = await fetchStatus();
            if (status.has_password && status.enabled && !isAuthorized()) {
                const authorized = await showPasswordDialog('duplicate');
                if (!authorized) return;
            }
            return originalClone();
        };
    }
    
    // 拦截 graph.serialize（工作流序列化）
    if (app.graph && app.graph.serialize) {
        const originalSerialize = app.graph.serialize.bind(app.graph);
        app.graph.serialize = function() {
            // 标记序列化调用
            const result = originalSerialize();
            return result;
        };
    }
    
    console.log('[Workflow Protector] LiteGraph 方法已拦截');
};

setTimeout(interceptLiteGraph, 1000);

// ==================== 拦截工作流保存和加载 ====================

// 保存时加密处理
async function handleSaveEncryption(workflow, filename) {
    const status = await fetchStatus();
    
    // 如果未启用保护，不加密
    if (!status.has_password || !status.enabled) {
        return { workflow, encrypted: false };
    }
    
    // 询问是否加密
    const result = await showEncryptionDialog('encrypt', filename);
    
    if (result.cancelled) {
        if (result.skipEncryption) {
            // 用户选择不加密，直接保存
            return { workflow, encrypted: false };
        }
        return { workflow: null, cancelled: true };
    }
    
    if (result.password) {
        // 调用后端API加密
        const encryptResult = await encryptWorkflow(workflow, result.password);
        
        if (encryptResult.success) {
            console.log('[Workflow Protector] 工作流已加密');
            return { workflow: encryptResult.encrypted, encrypted: true };
        } else {
            alert('加密失败: ' + encryptResult.error);
            return { workflow, encrypted: false };
        }
    }
    
    return { workflow, encrypted: false };
}

// 加载时解密处理
async function handleLoadDecryption(data, filename) {
    if (!isEncryptedWorkflow(data)) {
        return { workflow: data, encrypted: false };
    }
    
    console.log('[Workflow Protector] 检测到加密工作流');
    
    // 设置解密中标志，防止触发其他保护机制
    isDecryptingWorkflow = true;
    
    try {
        // 如果有缓存的密码，先尝试
        if (encryptionPassword) {
            const result = await decryptWorkflow(data, encryptionPassword);
            if (result.success) {
                console.log('[Workflow Protector] 使用缓存密码解密成功');
                return { workflow: result.workflow, encrypted: true };
            }
            // 密码不对，清除缓存
            encryptionPassword = null;
        }
        
        // 请求密码
        const dialogResult = await showEncryptionDialog('decrypt', filename);
        
        if (dialogResult.cancelled) {
            return { workflow: null, cancelled: true, error: '用户取消解密' };
        }
        
        // 调用后端API解密
        const result = await decryptWorkflow(data, dialogResult.password);
        
        if (result.success) {
            // 缓存密码
            encryptionPassword = dialogResult.password;
            console.log('[Workflow Protector] 工作流已解密');
            return { workflow: result.workflow, encrypted: true };
        } else {
            alert('解密失败: ' + result.error);
            return { workflow: null, cancelled: true, error: result.error };
        }
    } finally {
        // 无论成功失败，都要清除标志
        isDecryptingWorkflow = false;
    }
}

// 拦截文件保存（核心逻辑）
function interceptFileSave() {
    // 拦截下载链接的创建和点击
    const originalCreateElement = document.createElement.bind(document);
    
    document.createElement = function(tagName) {
        const element = originalCreateElement(tagName);
        
        if (tagName.toLowerCase() === 'a') {
            const originalClick = element.click.bind(element);
            
            element.click = function() {
                // 如果标记了bypass，直接执行原始点击（用于加密后的下载链接）
                if (this._wpBypass) {
                    return originalClick();
                }
                
                const download = this.download || '';
                const href = this.href || '';
                
                // 检查是否是工作流JSON文件下载
                const isWorkflowFile = download.endsWith('.json') || 
                                       download.includes('workflow') ||
                                       download.includes('template') ||
                                       href.includes('blob:');
                const isWorkflowSave = (download.endsWith('.json') || download.includes('workflow')) && href.startsWith('blob:');
                
                // ★ 关键修复：如果没有设置密码或保护未启用，同步执行原始点击
                // 不走async路径，避免blob URL在异步等待期间被ComfyUI回收
                if (!protectionStatus.has_password || !protectionStatus.enabled) {
                    return originalClick();
                }
                
                // 有密码保护的情况下，走async路径
                const self = this;
                (async () => {
                    // 导出保护检查：未授权时需要输入密码
                    if (isWorkflowFile && !isAuthorized()) {
                        const authorized = await showPasswordDialog('export');
                        if (!authorized) {
                            console.log('[Workflow Protector] 导出被阻止');
                            return;
                        }
                    }
                    
                    // 加密处理（仅对工作流JSON文件）
                    if (isWorkflowSave) {
                        try {
                            // 获取Blob内容
                            const response = await fetch(href);
                            const text = await response.text();
                            let workflow;
                            
                            try {
                                workflow = JSON.parse(text);
                            } catch (e) {
                                // 不是有效JSON，直接保存
                                originalClick();
                                return;
                            }
                            
                            // 如果已经加密，直接保存
                            if (isEncryptedWorkflow(workflow)) {
                                originalClick();
                                return;
                            }
                            
                            // 处理加密
                            const result = await handleSaveEncryption(workflow, download);
                            
                            if (result.cancelled) {
                                console.log('[Workflow Protector] 保存已取消');
                                URL.revokeObjectURL(href);
                                return;
                            }
                            
                            if (result.encrypted) {
                                // 创建新的加密Blob并下载
                                const jsonStr = JSON.stringify(result.workflow, null, 2);
                                const newBlob = new Blob([jsonStr], { type: 'application/json' });
                                const newUrl = URL.createObjectURL(newBlob);
                                
                                const newLink = document.createElement('a');
                                newLink.href = newUrl;
                                newLink.download = download.replace('.json', '_encrypted.json');
                                newLink.style.display = 'none';
                                newLink._wpBypass = true; // 标记跳过拦截
                                
                                document.body.appendChild(newLink);
                                newLink.click();
                                
                                // 延迟清理，确保下载已开始
                                setTimeout(() => {
                                    document.body.removeChild(newLink);
                                    URL.revokeObjectURL(newUrl);
                                    URL.revokeObjectURL(href);
                                }, 1000);
                                return;
                            }
                        } catch (e) {
                            console.error('[Workflow Protector] 保存处理错误:', e);
                        }
                    }
                    
                    // 正常保存（授权后或不需要加密时）
                    originalClick();
                })();
            };
        }
        
        return element;
    };
    
    console.log('[Workflow Protector] 文件保存拦截已启用');
}

// 拦截工作流加载
function interceptWorkflowLoad() {
    // 等待app加载
    const setupLoadInterception = () => {
        if (!app || !app.loadGraphData) {
            setTimeout(setupLoadInterception, 500);
            return;
        }
        
        // 拦截 loadGraphData
        const originalLoadGraphData = app.loadGraphData.bind(app);
        
        app.loadGraphData = async function(data, ...args) {
            // 检查是否是加密工作流
            if (isEncryptedWorkflow(data)) {
                const result = await handleLoadDecryption(data, 'workflow');
                
                if (result.cancelled || !result.workflow) {
                    console.log('[Workflow Protector] 加载已取消或解密失败');
                    return;
                }
                
                data = result.workflow;
            }
            
            return originalLoadGraphData(data, ...args);
        };
        
        console.log('[Workflow Protector] loadGraphData 拦截已启用');
    };
    
    setupLoadInterception();
    
    // 拦截文件读取
    const OriginalFileReader = FileReader;
    
    window.FileReader = function() {
        const reader = new OriginalFileReader();
        const originalReadAsText = reader.readAsText.bind(reader);
        
        reader.readAsText = function(blob, encoding) {
            const originalOnload = reader.onload;
            
            reader.onload = async function(e) {
                let result = e.target.result;
                
                try {
                    const data = JSON.parse(result);
                    
                    if (isEncryptedWorkflow(data)) {
                        const decryptResult = await handleLoadDecryption(data, blob.name || 'workflow.json');
                        
                        if (decryptResult.workflow) {
                            // 替换结果为解密后的数据
                            Object.defineProperty(e.target, 'result', {
                                value: JSON.stringify(decryptResult.workflow),
                                writable: false,
                                configurable: true
                            });
                        } else {
                            // 解密失败，阻止加载
                            console.log('[Workflow Protector] 解密失败或取消，阻止加载');
                            return;
                        }
                    }
                } catch (err) {
                    // 不是JSON或解析错误，继续正常处理
                }
                
                if (originalOnload) {
                    originalOnload.call(reader, e);
                }
            };
            
            return originalReadAsText(blob, encoding);
        };
        
        return reader;
    };
    window.FileReader.prototype = OriginalFileReader.prototype;
    
    console.log('[Workflow Protector] FileReader 拦截已启用');
    
    // 拦截拖放
    document.addEventListener('drop', async (e) => {
        const files = e.dataTransfer?.files;
        if (!files || files.length === 0) return;
        
        for (const file of files) {
            if (file.name.endsWith('.json')) {
                try {
                    const text = await file.text();
                    const data = JSON.parse(text);
                    
                    if (isEncryptedWorkflow(data)) {
                        // 阻止默认处理
                        e.preventDefault();
                        e.stopPropagation();
                        
                        const result = await handleLoadDecryption(data, file.name);
                        
                        if (result.workflow && app.loadGraphData) {
                            app.loadGraphData(result.workflow);
                        }
                        return;
                    }
                } catch (err) {
                    // 忽略
                }
            }
        }
    }, true);
}

// ==================== 浮动按钮 ====================

function createFloatingButton() {
    // 检查是否已存在
    if (document.getElementById('wp-floating-btn')) return;
    
    const btn = document.createElement('div');
    btn.id = 'wp-floating-btn';
    btn.innerHTML = '🛡️';
    btn.title = '工作流保护设置';
    btn.style.cssText = `
        position: fixed;
        top: 50%;
        right: 0;
        transform: translateY(-50%);
        width: 40px;
        height: 40px;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        border-radius: 8px 0 0 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 20px;
        cursor: pointer;
        z-index: 99997;
        box-shadow: -2px 0 10px rgba(0,0,0,0.3);
        transition: all 0.3s;
    `;
    
    btn.onmouseenter = () => {
        btn.style.width = '120px';
        btn.innerHTML = '🛡️ 保护设置';
        btn.style.fontSize = '14px';
        btn.style.paddingLeft = '10px';
        btn.style.justifyContent = 'flex-start';
    };
    
    btn.onmouseleave = () => {
        btn.style.width = '40px';
        btn.innerHTML = '🛡️';
        btn.style.fontSize = '20px';
        btn.style.paddingLeft = '0';
        btn.style.justifyContent = 'center';
    };
    
    btn.onclick = showSettingsDialog;
    document.body.appendChild(btn);
    
    console.log('[Workflow Protector] 浮动按钮已创建');
}

// ==================== 注册扩展 ====================

app.registerExtension({
    name: "Workflow.Protector.Enhanced",
    
    async setup() {
        // 获取初始状态
        await fetchStatus();
        
        // 创建浮动按钮
        createFloatingButton();
        
        // 启用文件保存拦截（加密功能）
        interceptFileSave();
        
        // 启用文件加载拦截（解密功能）
        interceptWorkflowLoad();
        
        // 同时尝试添加到传统菜单（兼容不同版本）
        const menuSelectors = [
            ".comfy-menu",
            ".side-bar-menu", 
            "#comfy-menu",
            ".comfyui-menu"
        ];
        
        for (const selector of menuSelectors) {
            const menu = document.querySelector(selector);
            if (menu) {
                const btn = document.createElement("button");
                btn.innerHTML = "🛡️ 工作流保护";
                btn.style.cssText = "margin-top: 5px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border: none; color: white; font-weight: 500; padding: 8px 12px; border-radius: 6px; cursor: pointer;";
                btn.onclick = showSettingsDialog;
                menu.appendChild(btn);
                console.log('[Workflow Protector] 菜单按钮已添加到:', selector);
                break;
            }
        }
        
        console.log('[Workflow Protector] 已激活 - 全面保护 + 加密模式');
        console.log('[Workflow Protector] 功能: 导出保护 / 复制保护 / 文件加密');
    }
});

// ==================== 初始化 ====================

// 立即获取状态
fetchStatus().then(status => {
    console.log('[Workflow Protector] 状态:', status.has_password ? (status.enabled ? '已启用' : '已禁用') : '未设置');
    console.log('[Workflow Protector] 加密说明: 保存时可选加密，本机自动解密，其他电脑需要密码');
});

// 定期刷新状态（每30秒）
setInterval(() => {
    fetchStatus().then(status => {
        // 静默更新，不输出日志
    });
}, 30000);
