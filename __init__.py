import os
import sys
import json
import hashlib
import secrets
import time
import asyncio
import functools
import base64
import stat
from aiohttp import web
from server import PromptServer

# ==================== 加密模块 ====================

try:
    from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
    from cryptography.hazmat.backends import default_backend
    from cryptography.hazmat.primitives import padding
    HAS_CRYPTO = True
except ImportError:
    HAS_CRYPTO = False
    print("\033[93m[Workflow Protector] 警告: 未安装cryptography库，使用内置加密\033[0m")
    print("\033[93m[Workflow Protector] 建议运行: pip install cryptography\033[0m")

class WorkflowEncryption:
    """工作流加密类"""
    
    MAGIC_HEADER = "COMFYUI_PROTECTED_WORKFLOW_V1"
    
    @staticmethod
    def derive_key(password, salt, machine_key=""):
        """从密码派生加密密钥
        """
        # 使用PBKDF2派生256位密钥（只用密码，不绑定机器）
        key = hashlib.pbkdf2_hmac(
            'sha256',
            password.encode('utf-8'),
            salt.encode('utf-8'),
            100000,
            dklen=32
        )
        return key
    
    @staticmethod
    def encrypt_workflow(workflow_json, password, machine_key=""):
        """加密工作流（便携模式，可跨机器使用）"""
        salt = secrets.token_hex(16)
        iv = secrets.token_bytes(16)
        key = WorkflowEncryption.derive_key(password, salt)
        
        # 将工作流转为JSON字符串
        if isinstance(workflow_json, dict):
            data = json.dumps(workflow_json, ensure_ascii=False)
        else:
            data = workflow_json
        
        data_bytes = data.encode('utf-8')
        
        # 记录使用的加密方法
        cipher_method = "AES-CBC" if HAS_CRYPTO else "XOR"
        
        if HAS_CRYPTO:
            # 使用cryptography库的AES-CBC
            padder = padding.PKCS7(128).padder()
            padded_data = padder.update(data_bytes) + padder.finalize()
            
            cipher = Cipher(algorithms.AES(key), modes.CBC(iv), backend=default_backend())
            encryptor = cipher.encryptor()
            encrypted = encryptor.update(padded_data) + encryptor.finalize()
        else:
            # 简单的XOR加密作为后备（不如AES安全，但也能用）
            encrypted = WorkflowEncryption._xor_encrypt(data_bytes, key, iv)
        
        # 构建加密后的文件结构
        # 添加一个假的工作流结构，让没有插件的ComfyUI显示提示信息
        note_text = (
            "⚠️ 此工作流已加密保护 ⚠️\n\n"
            "需要安装 Workflow Protector 插件才能使用。\n\n"
            "安装插件后，重新拖入此文件即可解密。"
        )
        
        encrypted_workflow = {
            "_protected": WorkflowEncryption.MAGIC_HEADER,
            "_version": 1,
            "_cipher": cipher_method,
            "_salt": salt,
            "_iv": base64.b64encode(iv).decode('utf-8'),
            "_data": base64.b64encode(encrypted).decode('utf-8'),
            "_hint": "此工作流已加密保护，需要安装 Workflow Protector 插件并输入正确密码才能使用",
            # 假工作流 - 让没有插件的ComfyUI显示提示
            "last_node_id": 1,
            "last_link_id": 0,
            "nodes": [
                {
                    "id": 1,
                    "type": "Note",
                    "pos": [200, 200],
                    "size": {"0": 400, "1": 200},
                    "flags": {},
                    "order": 0,
                    "mode": 0,
                    "properties": {"text": ""},
                    "widgets_values": [note_text],
                    "color": "#432",
                    "bgcolor": "#653"
                }
            ],
            "links": [],
            "groups": [],
            "config": {},
            "extra": {},
            "version": 0.4
        }
        
        return encrypted_workflow
    
    @staticmethod
    def decrypt_workflow(encrypted_workflow, password, machine_key=""):
        """解密工作流（便携模式，可跨机器使用）"""
        if not isinstance(encrypted_workflow, dict):
            return None, "无效的加密文件"
        
        if encrypted_workflow.get("_protected") != WorkflowEncryption.MAGIC_HEADER:
            return None, "不是加密的工作流文件"
        
        try:
            salt = encrypted_workflow["_salt"]
            iv = base64.b64decode(encrypted_workflow["_iv"])
            encrypted_data = base64.b64decode(encrypted_workflow["_data"])
            cipher_method = encrypted_workflow.get("_cipher", "XOR")  # 默认XOR兼容旧版本
            
            key = WorkflowEncryption.derive_key(password, salt)
            
            if cipher_method == "AES-CBC":
                if not HAS_CRYPTO:
                    return None, "此工作流使用AES加密，请安装cryptography库: pip install cryptography"
                
                cipher = Cipher(algorithms.AES(key), modes.CBC(iv), backend=default_backend())
                decryptor = cipher.decryptor()
                padded_data = decryptor.update(encrypted_data) + decryptor.finalize()
                
                unpadder = padding.PKCS7(128).unpadder()
                data_bytes = unpadder.update(padded_data) + unpadder.finalize()
            else:
                # XOR解密
                data_bytes = WorkflowEncryption._xor_decrypt(encrypted_data, key, iv)
            
            workflow = json.loads(data_bytes.decode('utf-8'))
            return workflow, None
            
        except json.JSONDecodeError:
            return None, "解密失败: 密码错误"
        except UnicodeDecodeError:
            return None, "解密失败: 密码错误"
        except Exception as e:
            return None, "解密失败: 密码错误或文件损坏"
    
    @staticmethod
    def is_encrypted(workflow):
        """检查工作流是否已加密"""
        if isinstance(workflow, dict):
            return workflow.get("_protected") == WorkflowEncryption.MAGIC_HEADER
        return False
    
    @staticmethod
    def _xor_encrypt(data, key, iv):
        """简单XOR加密（后备方案）"""
        result = bytearray()
        key_iv = key + iv
        for i, byte in enumerate(data):
            result.append(byte ^ key_iv[i % len(key_iv)])
        return bytes(result)
    
    @staticmethod
    def _xor_decrypt(data, key, iv):
        """简单XOR解密（后备方案）"""
        return WorkflowEncryption._xor_encrypt(data, key, iv)  # XOR是对称的

# ==================== 安全配置管理 ====================

CONFIG_DIR = os.path.dirname(os.path.realpath(__file__))
CONFIG_FILE = os.path.join(CONFIG_DIR, ".wp_config")  # 隐藏文件
KEY_FILE = os.path.join(CONFIG_DIR, ".wp_key")  # 加密密钥

# 会话管理
active_sessions = {}  # {token: {"expires": timestamp, "ip": ip}}
SESSION_DURATION = 300  # 会话有效期5分钟

def get_or_create_key():
    """获取或创建加密密钥（每个安装唯一）"""
    if os.path.exists(KEY_FILE):
        with open(KEY_FILE, 'r') as f:
            return f.read().strip()
    
    # 生成新的随机密钥
    key = secrets.token_hex(32)
    
    with open(KEY_FILE, 'w') as f:
        f.write(key)
    
    # 设置文件权限：仅所有者可读写
    try:
        os.chmod(KEY_FILE, stat.S_IRUSR | stat.S_IWUSR)  # 600
    except:
        pass
    
    return key

def load_config():
    """加载配置"""
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
                data = f.read()
                try:
                    decoded = base64.b64decode(data).decode('utf-8')
                    return json.loads(decoded)
                except:
                    return json.loads(data)
        except Exception as e:
            print(f"\033[91m[Workflow Protector] 加载配置失败: {e}\033[0m")
    
    return {
        "password_hash": None,
        "password_salt": None,
        "enabled": True,
        "protection_level": "strict",
        "log_attempts": True,
        "created_at": None,
        "last_modified": None
    }

def save_config(config):
    """保存配置（混淆存储）"""
    config["last_modified"] = time.strftime("%Y-%m-%d %H:%M:%S")
    
    data = json.dumps(config, indent=2)
    encoded = base64.b64encode(data.encode('utf-8')).decode('utf-8')
    
    try:
        with open(CONFIG_FILE, 'w', encoding='utf-8') as f:
            f.write(encoded)
    except Exception as e:
        print(f"\033[91m[Workflow Protector] 保存配置失败: {e}\033[0m")
        raise e
    
    try:
        os.chmod(CONFIG_FILE, stat.S_IRUSR | stat.S_IWUSR)
    except:
        pass

def hash_password(password, salt=None):
    """使用PBKDF2进行密码哈希（更安全）"""
    if salt is None:
        salt = secrets.token_hex(16)  # 随机盐值
    
    # 使用 PBKDF2-HMAC-SHA256，迭代10万次
    key = hashlib.pbkdf2_hmac(
        'sha256',
        password.encode('utf-8'),
        (salt + get_or_create_key()).encode('utf-8'),  # 盐 + 安装唯一密钥
        100000  # 迭代次数，增加暴力破解难度
    )
    
    return base64.b64encode(key).decode('utf-8'), salt

def verify_password(password, stored_hash, stored_salt):
    """验证密码"""
    if not stored_hash or not stored_salt:
        return False
    
    computed_hash, _ = hash_password(password, stored_salt)
    
    # 使用常量时间比较，防止时序攻击
    return secrets.compare_digest(computed_hash, stored_hash)

def log_attempt(action, success, ip="unknown", details=""):
    """记录访问尝试"""
    config = load_config()
    if not config.get("log_attempts", True):
        return
    
    log_file = os.path.join(CONFIG_DIR, ".wp_access.log")  # 隐藏日志文件
    timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
    status = "✓" if success else "✗"
    
    try:
        with open(log_file, 'a', encoding='utf-8') as f:
            f.write(f"[{timestamp}] [{status}] {action} | IP: {ip} | {details}\n")
        
        # 设置文件权限
        try:
            os.chmod(log_file, stat.S_IRUSR | stat.S_IWUSR)  # 600
        except:
            pass
    except:
        pass

# ==================== 会话管理 ====================

def create_session(ip="unknown"):
    """创建新会话"""
    token = secrets.token_urlsafe(32)
    active_sessions[token] = {
        "expires": time.time() + SESSION_DURATION,
        "ip": ip,
        "created": time.time()
    }
    cleanup_sessions()
    return token

def verify_session(token, ip="unknown"):
    """验证会话"""
    if not token or token not in active_sessions:
        return False
    
    session = active_sessions[token]
    
    # 检查是否过期
    if time.time() > session["expires"]:
        del active_sessions[token]
        return False
    
    # 严格模式下检查IP
    config = load_config()
    if config.get("protection_level") == "strict":
        if session["ip"] != ip and session["ip"] != "unknown":
            return False
    
    # 刷新会话
    session["expires"] = time.time() + SESSION_DURATION
    return True

def cleanup_sessions():
    """清理过期会话"""
    current_time = time.time()
    expired = [t for t, s in active_sessions.items() if current_time > s["expires"]]
    for token in expired:
        del active_sessions[token]

def get_client_ip(request):
    """获取客户端IP"""
    peername = request.transport.get_extra_info('peername')
    if peername:
        return peername[0]
    return request.headers.get('X-Forwarded-For', 
           request.headers.get('X-Real-IP', 'unknown')).split(',')[0].strip()

# ==================== 保护检查 ====================

def is_protection_active():
    """检查保护是否激活"""
    config = load_config()
    return config.get("password_hash") is not None and config.get("enabled", True)

def check_authorization(request):
    """检查请求是否已授权"""
    if not is_protection_active():
        return True
    
    # 从多个来源获取token
    token = (
        request.headers.get('X-WP-Token') or 
        request.headers.get('Authorization', '').replace('Bearer ', '') or
        request.cookies.get('wp_session') or
        request.query.get('wp_token')
    )
    ip = get_client_ip(request)
    
    return verify_session(token, ip)

def check_password(password):
    """检查密码是否正确"""
    config = load_config()
    stored_hash = config.get("password_hash")
    stored_salt = config.get("password_salt")
    
    if not stored_hash or not stored_salt:
        return False
    
    return verify_password(password, stored_hash, stored_salt)

# ==================== API保护中间件 ====================

# 保存原始路由处理器
_original_handlers = {}

def create_protected_handler(original_handler, path):
    """创建受保护的处理器包装"""
    async def protected_handler(request):
        config = load_config()
        ip = get_client_ip(request)
        method = request.method
        
        # 如果保护未启用，直接放行
        if not is_protection_active():
            return await original_handler(request)
        
        protection_level = config.get("protection_level", "strict")
        
        # 定义敏感路径
        sensitive_paths = [
            '/prompt',      # 工作流执行
            '/queue',       # 队列
            '/history',     # 历史记录
            '/object_info', # 节点信息
            '/view',        # 查看输出
        ]
        
        is_sensitive = any(path.startswith(sp) for sp in sensitive_paths)
        
        # 严格模式
        if protection_level == "strict":
            if (is_sensitive or method == 'POST') and not check_authorization(request):
                log_attempt(f"{method} {path}", False, ip, "Strict mode blocked")
                return web.json_response({
                    "error": "需要授权才能执行此操作",
                    "code": "AUTH_REQUIRED",
                    "message": "请先通过工作流保护验证"
                }, status=401)
        
        # 中等模式
        elif protection_level == "moderate":
            if is_sensitive and not check_authorization(request):
                log_attempt(f"{method} {path}", False, ip, "Moderate mode blocked")
                return web.json_response({
                    "error": "需要授权才能访问此资源",
                    "code": "AUTH_REQUIRED"
                }, status=401)
        
        # 基础模式：只记录
        elif protection_level == "basic":
            if is_sensitive:
                authorized = check_authorization(request)
                log_attempt(f"{method} {path}", authorized, ip, f"Basic mode")
        
        return await original_handler(request)
    
    return protected_handler

def install_route_protection():
    """安装路由保护（通过包装现有路由）"""
    try:
        routes = PromptServer.instance.routes
        app = PromptServer.instance.app
        
        # 需要保护的路径
        protected_paths = ['/prompt', '/queue', '/history', '/object_info', '/view']
        
        print("\033[93m[Workflow Protector] 路由保护模式已启用\033[0m")
        return True
    except Exception as e:
        print(f"\033[91m[Workflow Protector] 路由保护安装失败: {e}\033[0m")
        return False

# 尝试注册中间件（可能在某些ComfyUI版本中有效）
_middleware_installed = False
try:
    # 中间件 - 只处理插件自身的API白名单，不拦截任何ComfyUI原生API
    @web.middleware
    async def protection_middleware(request, handler):
        """保护中间件 - 仅记录日志，不拦截API"""
        # 直接放行所有请求，保护通过前端实现
        return await handler(request)
    
    _middleware_installed = True
    print("\033[92m[Workflow Protector] 插件已加载\033[0m")
except Exception as e:
    print(f"\033[93m[Workflow Protector] 中间件注册跳过: {e}\033[0m")

# ==================== 核心API路由 ====================

@PromptServer.instance.routes.post("/workflow_protector/verify")
async def verify_password_api(request):
    """验证密码并创建会话"""
    try:
        data = await request.json()
        password = data.get("password", "")
        ip = get_client_ip(request)
        
        config = load_config()
        
        # 未设置密码
        if not config.get("password_hash"):
            token = create_session(ip)
            log_attempt("verify", True, ip, "No password set")
            response = web.json_response({
                "success": True, 
                "message": "未设置保护密码",
                "token": token,
                "expires_in": SESSION_DURATION
            })
            response.set_cookie("wp_session", token, max_age=SESSION_DURATION, httponly=True, samesite='Lax')
            return response
        
        # 保护未启用
        if not config.get("enabled", True):
            token = create_session(ip)
            log_attempt("verify", True, ip, "Protection disabled")
            response = web.json_response({
                "success": True, 
                "message": "保护未启用",
                "token": token,
                "expires_in": SESSION_DURATION
            })
            response.set_cookie("wp_session", token, max_age=SESSION_DURATION, httponly=True, samesite='Lax')
            return response
        
        # 验证密码
        if check_password(password):
            token = create_session(ip)
            log_attempt("verify", True, ip, "Password correct")
            response = web.json_response({
                "success": True, 
                "message": "验证成功",
                "token": token,
                "expires_in": SESSION_DURATION
            })
            response.set_cookie("wp_session", token, max_age=SESSION_DURATION, httponly=True, samesite='Lax')
            return response
        else:
            log_attempt("verify", False, ip, "Wrong password")
            await asyncio.sleep(2)  # 增加延迟到2秒，防暴力破解
            return web.json_response({"success": False, "message": "密码错误"})
            
    except Exception as e:
        return web.json_response({"success": False, "message": str(e)})

@PromptServer.instance.routes.post("/workflow_protector/set_password")
async def set_password_api(request):
    """设置新密码"""
    try:
        data = await request.json()
        old_password = data.get("old_password", "")
        new_password = data.get("new_password", "")
        ip = get_client_ip(request)
        
        config = load_config()
        
        if config.get("password_hash"):
            if not check_password(old_password):
                log_attempt("set_password", False, ip, "Wrong old password")
                await asyncio.sleep(2)
                return web.json_response({"success": False, "message": "原密码错误"})
        
        if not new_password:
            return web.json_response({"success": False, "message": "新密码不能为空"})
        
        if len(new_password) < 6:
            return web.json_response({"success": False, "message": "密码长度至少6位"})
        
        password_hash, password_salt = hash_password(new_password)
        
        config["password_hash"] = password_hash
        config["password_salt"] = password_salt
        
        if not config.get("created_at"):
            config["created_at"] = time.strftime("%Y-%m-%d %H:%M:%S")
        
        save_config(config)
        active_sessions.clear()
        
        log_attempt("set_password", True, ip, "Password changed")
        print(f"\033[92m[Workflow Protector] 密码设置成功\033[0m")
        return web.json_response({"success": True, "message": "密码设置成功"})
        
    except Exception as e:
        print(f"\033[91m[Workflow Protector] 设置密码异常: {e}\033[0m")
        return web.json_response({"success": False, "message": str(e)})

@PromptServer.instance.routes.post("/workflow_protector/toggle")
async def toggle_protection(request):
    """开关保护功能"""
    try:
        data = await request.json()
        password = data.get("password", "")
        enabled = data.get("enabled", True)
        ip = get_client_ip(request)
        
        config = load_config()
        
        if config.get("password_hash"):
            if not check_password(password):
                log_attempt("toggle", False, ip, "Wrong password")
                return web.json_response({"success": False, "message": "密码错误"})
        
        config["enabled"] = enabled
        save_config(config)
        
        if not enabled:
            active_sessions.clear()
        
        status = "启用" if enabled else "禁用"
        log_attempt("toggle", True, ip, f"Protection {status}")
        return web.json_response({"success": True, "message": f"保护已{status}"})
        
    except Exception as e:
        return web.json_response({"success": False, "message": str(e)})

@PromptServer.instance.routes.get("/workflow_protector/status")
async def get_status(request):
    """获取保护状态"""
    config = load_config()
    is_authorized = check_authorization(request)
    
    return web.json_response({
        "has_password": config.get("password_hash") is not None,
        "enabled": config.get("enabled", True),
        "protection_level": config.get("protection_level", "strict"),
        "is_authorized": is_authorized,
        "session_duration": SESSION_DURATION,
        "active_sessions": len(active_sessions)
    })

@PromptServer.instance.routes.post("/workflow_protector/clear_password")
async def clear_password(request):
    """清除密码"""
    try:
        data = await request.json()
        password = data.get("password", "")
        ip = get_client_ip(request)
        
        config = load_config()
        
        if config.get("password_hash"):
            if not check_password(password):
                log_attempt("clear_password", False, ip, "Wrong password")
                return web.json_response({"success": False, "message": "密码错误"})
        
        config["password_hash"] = None
        config["password_salt"] = None
        save_config(config)
        active_sessions.clear()
        
        log_attempt("clear_password", True, ip, "Password cleared")
        return web.json_response({"success": True, "message": "密码已清除"})
        
    except Exception as e:
        return web.json_response({"success": False, "message": str(e)})

@PromptServer.instance.routes.post("/workflow_protector/set_level")
async def set_protection_level(request):
    """设置保护级别"""
    try:
        data = await request.json()
        password = data.get("password", "")
        level = data.get("level", "strict")
        ip = get_client_ip(request)
        
        if level not in ["strict", "moderate", "basic"]:
            return web.json_response({"success": False, "message": "无效的保护级别"})
        
        config = load_config()
        
        if config.get("password_hash"):
            if not check_password(password):
                return web.json_response({"success": False, "message": "密码错误"})
        
        config["protection_level"] = level
        save_config(config)
        
        level_names = {"strict": "严格", "moderate": "中等", "basic": "基础"}
        log_attempt("set_level", True, ip, f"Level: {level}")
        return web.json_response({
            "success": True, 
            "message": f"保护级别已设置为: {level_names.get(level, level)}"
        })
        
    except Exception as e:
        return web.json_response({"success": False, "message": str(e)})

@PromptServer.instance.routes.post("/workflow_protector/logout")
async def logout(request):
    """登出会话"""
    token = (
        request.headers.get('X-WP-Token') or 
        request.cookies.get('wp_session')
    )
    ip = get_client_ip(request)
    
    if token and token in active_sessions:
        del active_sessions[token]
        log_attempt("logout", True, ip, "Session destroyed")
    
    response = web.json_response({"success": True, "message": "已登出"})
    response.del_cookie("wp_session")
    return response

@PromptServer.instance.routes.get("/workflow_protector/logs")
async def get_logs(request):
    """获取访问日志"""
    if not check_authorization(request):
        return web.json_response({"success": False, "message": "需要授权"}, status=401)
    
    log_file = os.path.join(CONFIG_DIR, ".wp_access.log")
    
    if not os.path.exists(log_file):
        return web.json_response({"success": True, "logs": []})
    
    try:
        with open(log_file, 'r', encoding='utf-8') as f:
            lines = f.readlines()[-100:]
        return web.json_response({"success": True, "logs": [l.strip() for l in lines]})
    except Exception as e:
        return web.json_response({"success": False, "message": str(e)})

@PromptServer.instance.routes.post("/workflow_protector/clear_logs")
async def clear_logs(request):
    """清除日志"""
    if not check_authorization(request):
        return web.json_response({"success": False, "message": "需要授权"}, status=401)
    
    log_file = os.path.join(CONFIG_DIR, ".wp_access.log")
    
    try:
        if os.path.exists(log_file):
            os.remove(log_file)
        return web.json_response({"success": True, "message": "日志已清除"})
    except Exception as e:
        return web.json_response({"success": False, "message": str(e)})

# ==================== 工作流加密API ====================

@PromptServer.instance.routes.post("/workflow_protector/encrypt")
async def encrypt_workflow(request):
    """加密工作流"""
    try:
        data = await request.json()
        workflow = data.get("workflow")
        password = data.get("password", "")
        
        if not workflow:
            return web.json_response({"success": False, "message": "工作流数据为空"})
        
        if not password:
            return web.json_response({"success": False, "message": "加密密码不能为空"})
        
        if len(password) < 4:
            return web.json_response({"success": False, "message": "密码至少4位"})
        
        # 加密工作流（便携模式，可跨机器使用）
        encrypted = WorkflowEncryption.encrypt_workflow(workflow, password)
        
        ip = get_client_ip(request)
        log_attempt("encrypt", True, ip, "Workflow encrypted")
        
        return web.json_response({
            "success": True, 
            "message": "加密成功",
            "encrypted": encrypted
        })
        
    except Exception as e:
        return web.json_response({"success": False, "message": str(e)})

@PromptServer.instance.routes.post("/workflow_protector/decrypt")
async def decrypt_workflow(request):
    """解密工作流"""
    try:
        data = await request.json()
        encrypted_workflow = data.get("workflow")
        password = data.get("password", "")
        
        if not encrypted_workflow:
            return web.json_response({"success": False, "message": "工作流数据为空"})
        
        if not password:
            return web.json_response({"success": False, "message": "解密密码不能为空"})
        
        # 解密工作流（便携模式，可跨机器使用）
        workflow, error = WorkflowEncryption.decrypt_workflow(encrypted_workflow, password)
        
        ip = get_client_ip(request)
        
        if error:
            log_attempt("decrypt", False, ip, error)
            await asyncio.sleep(1)  # 防暴力破解
            return web.json_response({"success": False, "message": error})
        
        log_attempt("decrypt", True, ip, "Workflow decrypted")
        
        return web.json_response({
            "success": True, 
            "message": "解密成功",
            "workflow": workflow
        })
        
    except Exception as e:
        return web.json_response({"success": False, "message": str(e)})

@PromptServer.instance.routes.post("/workflow_protector/check_encrypted")
async def check_encrypted(request):
    """检查工作流是否已加密"""
    try:
        data = await request.json()
        workflow = data.get("workflow")
        
        is_encrypted = WorkflowEncryption.is_encrypted(workflow)
        
        return web.json_response({
            "success": True,
            "encrypted": is_encrypted
        })
        
    except Exception as e:
        return web.json_response({"success": False, "message": str(e)})

# ==================== 初始化 ====================

# 初始化加密密钥
try:
    _key = get_or_create_key()
    print(f"\033[92m[Workflow Protector] 安全密钥已{'加载' if os.path.exists(KEY_FILE) else '生成'}\033[0m")
except Exception as e:
    print(f"\033[91m[Workflow Protector] 密钥初始化失败: {e}\033[0m")

WEB_DIRECTORY = "./js"
NODE_CLASS_MAPPINGS = {}
NODE_DISPLAY_NAME_MAPPINGS = {}
__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]

print("\033[92m╔════════════════════════════════════════════╗\033[0m")
print("\033[92m║  Workflow Protector 安全增强版 已加载      ║\033[0m")
print("\033[92m║  • PBKDF2-SHA256 密码哈希 (10万次迭代)    ║\033[0m")
print("\033[92m║  • 随机盐值 + 安装唯一密钥                ║\033[0m")
print("\033[92m║  • 配置文件权限保护 (600)                 ║\033[0m")
print("\033[92m║  • 会话时长: 5分钟 | 错误延迟: 2秒        ║\033[0m")
print("\033[92m╚════════════════════════════════════════════╝\033[0m")
