// 用户认证和状态管理
let currentUser = null;
let authToken = null;
let isGuest = false;

// 私聊功能相关变量
let privateChats = new Map(); // 存储私聊窗口
let privateChatWindows = new Map(); // 存储私聊窗口DOM元素

// 私聊消息本地存储
const PRIVATE_CHAT_STORAGE_KEY = 'lanPrivateChatHistory';
const MAX_PRIVATE_MESSAGES = 500; // 每个私聊最多保存500条消息

// 保存私聊消息到本地存储
function savePrivateMessageToStorage(chatId, message) {
    try {
        const key = `${PRIVATE_CHAT_STORAGE_KEY}_${chatId}`;
        let history = JSON.parse(localStorage.getItem(key) || '[]');
        history.push(message);

        // 限制消息数量
        if (history.length > MAX_PRIVATE_MESSAGES) {
            history = history.slice(-MAX_PRIVATE_MESSAGES);
        }

        localStorage.setItem(key, JSON.stringify(history));
    } catch (e) {
        console.error('保存私聊消息到本地存储失败:', e);
    }
}

// 从本地存储加载私聊历史记录
function loadPrivateHistoryFromStorage(chatId) {
    try {
        const key = `${PRIVATE_CHAT_STORAGE_KEY}_${chatId}`;
        const history = JSON.parse(localStorage.getItem(key) || '[]');
        return history;
    } catch (e) {
        console.error('加载私聊历史记录失败:', e);
        return [];
    }
}

// 检查用户登录状态
function checkAuthStatus() {
    const token = localStorage.getItem('authToken');
    const user = localStorage.getItem('currentUser');

    if (token && user) {
        try {
            currentUser = JSON.parse(user);
            authToken = token;
            updateUserDisplay();
            return true;
        } catch (e) {
            console.error('解析用户信息失败:', e);
            clearAuthData();
        }
    }

    // 如果没有登录，询问是否以游客身份进入
    if (!confirm('是否以游客身份进入聊天？\n点击"确定"以游客身份进入，点击"取消"前往登录页面')) {
        window.location.href = 'login.html';
        return false;
    }

    isGuest = true;
    currentUser = { username: prompt("请输入昵称") || "匿名用户" };
    updateUserDisplay();
    return true;
}

// 更新用户显示
function updateUserDisplay() {
    const usernameDisplay = document.getElementById('username-display');
    const logoutBtn = document.getElementById('logoutBtn');

    if (currentUser) {
        usernameDisplay.textContent = currentUser.username;
        if (!isGuest) {
            logoutBtn.style.display = 'block';
        } else {
            logoutBtn.style.display = 'none';
        }
    }
}

// 清除认证数据
function clearAuthData() {
    localStorage.removeItem('authToken');
    localStorage.removeItem('currentUser');
    currentUser = null;
    authToken = null;
}

// 登出功能
function logout() {
    clearAuthData();
    window.location.href = 'login.html';
}

// 初始化认证状态
if (!checkAuthStatus()) {
    // 如果用户选择取消，页面会跳转到登录页面
    throw new Error('用户取消操作');
}

// WebSocket 连接管理
let ws = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY = 3000;

// 使用免费的WebSocket服务
const WS_SERVERS = [
    'wss://echo.websocket.org',  // 免费测试服务
    'wss://ws.postman-echo.com/raw',  // Postman Echo服务
    'wss://demos.kaazing.com/echo'  // Kaazing Echo服务
];

let currentWsServerIndex = 0;

function connectWebSocket() {
    console.log('=== 调试信息 ===');
    console.log('当前域名:', location.hostname);
    console.log('当前URL:', location.href);
    console.log('isGitHubPages() 结果:', isGitHubPages());
    console.log('================');
    
    // 如果是GitHub Pages环境，直接启用本地模式
    if (isGitHubPages()) {
        console.log('检测到GitHub Pages环境，启用本地聊天模式');
        initLocalChatMode();
        return;
    }
    
    console.log('未检测到GitHub Pages环境，尝试WebSocket连接');
    
    // 如果是本地开发环境，使用本地服务器
    if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
        const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
        const wsUrl = `${protocol}://${location.host}`;
        console.log('本地开发环境，连接:', wsUrl);
        ws = new WebSocket(wsUrl);
    } else {
        // 生产环境使用免费WebSocket服务
        const wsUrl = WS_SERVERS[currentWsServerIndex];
        console.log('生产环境，连接免费WebSocket服务:', wsUrl);
        ws = new WebSocket(wsUrl);
    }
    
    ws.onopen = () => {
        console.log('WebSocket连接成功');
        reconnectAttempts = 0;
        
        // 发送加入消息
        const joinMessage = {
            type: "join",
            user: currentUser.username,
            timestamp: Date.now()
        };
        
        if (isGuest) {
            joinMessage.token = null;
        } else {
            joinMessage.token = authToken;
        }
        
        ws.send(JSON.stringify(joinMessage));
        
        // 显示连接成功消息
        appendMessage({ 
            type: 'system', 
            text: '✅ 连接成功！可以开始聊天了' 
        }, false);
    };
    
    ws.onclose = (event) => {
        console.log('WebSocket连接关闭:', event.code, event.reason);
        
        // 显示连接断开消息
        appendMessage({ 
            type: 'system', 
            text: '❌ 连接断开，正在尝试重连...' 
        }, false);
        
        if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
            reconnectAttempts++;
            console.log(`尝试重连 (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`);
            
            // 尝试下一个WebSocket服务器
            if (location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
                currentWsServerIndex = (currentWsServerIndex + 1) % WS_SERVERS.length;
            }
            
            setTimeout(connectWebSocket, RECONNECT_DELAY);
        } else {
            console.error('WebSocket重连失败，启用本地模式');
            appendMessage({ 
                type: 'system', 
                text: '❌ 连接失败，切换到本地聊天模式' 
            }, false);
            
            // 连接失败后启用本地模式
            initLocalChatMode();
        }
    };
    
    ws.onerror = (error) => {
        console.error('WebSocket连接错误:', error);
    };
    
    ws.onmessage = async (event) => {
        const raw = event.data instanceof Blob ? await event.data.text() : event.data;
        let data;
        
        try { 
            data = JSON.parse(raw); 
        } catch (e) {
            console.log('收到非JSON消息:', raw);
            return; 
        }

        console.log('收到消息:', data);

        if (data.type === 'message') {
            appendMessage(data, true);
        } else if (data.type === 'join') {
            appendMessage({ type: 'system', text: `👋 ${data.user} 加入了聊天室` }, false);
        } else if (data.type === 'leave') {
            appendMessage({ type: 'system', text: `❌ ${data.user} 离开了聊天室` }, false);
        } else if (data.type === 'users') {
            updateUserList(data.list);
        } else if (data.type === 'file') {
            appendMessage(data, true);
        } else if (data.type === 'private_message') {
            // 只处理别人发给自己的消息
            if (data.from === currentUser.username) return;
            const chatId = [data.from, data.to].sort().join('_');
            if (!privateChatWindows.has(chatId)) {
                const targetUser = data.from === currentUser.username ? data.to : data.from;
                openPrivateChat(targetUser);
            }
            addPrivateMessage(chatId, data.from, data.text, false);
            const window = privateChatWindows.get(chatId);
            if (window) {
                window.style.animation = 'none';
                setTimeout(() => {
                    window.style.animation = 'chatWindowIn 0.3s ease-out';
                }, 10);
            }
        } else if (data.type === 'recall_message') {
            // 处理撤回消息
            handleRecallMessage(data);
        } else if (data.type === 'error') {
            console.error('服务器错误:', data.message);
            appendMessage({ 
                type: 'system', 
                text: `❌ 错误: ${data.message}` 
            }, false);
        } else if (data.type === 'echo') {
            // 处理echo服务的回显消息
            console.log('Echo服务回显:', data);
        }
    };
}

// 初始化WebSocket连接
connectWebSocket();

const chat = document.getElementById('chat');
const input = document.getElementById('msgInput');
const sendBtn = document.getElementById('sendBtn');
const userList = document.getElementById('userList');
const fileInput = document.getElementById('fileInput');
const attachBtn = document.getElementById('attachBtn');
const emojiBtn = document.getElementById('emojiBtn');
const emojiPicker = document.getElementById('emojiPicker');
const settingsBtn = document.getElementById('settingsBtn');
const settingsMenu = document.getElementById('settingsMenu');
const bubbleSelect = document.getElementById('bubbleStyleSelect');
const toggleUsersBtn = document.getElementById('toggleUsersBtn');
const usersSection = document.getElementById('users-section');
const logoutBtn = document.getElementById('logoutBtn');

// 绑定登出按钮
logoutBtn.addEventListener('click', logout);

// 聊天记录管理
const CHAT_STORAGE_KEY = 'lanChatHistory';
const MAX_MESSAGES = 1000; // 最多保存1000条消息

// 保存消息到本地存储
function saveMessageToStorage(message) {
    try {
        let history = JSON.parse(localStorage.getItem(CHAT_STORAGE_KEY) || '[]');
        history.push(message);

        // 限制消息数量
        if (history.length > MAX_MESSAGES) {
            history = history.slice(-MAX_MESSAGES);
        }

        localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(history));
    } catch (e) {
        console.error('保存消息到本地存储失败:', e);
    }
}

// 从本地存储加载历史记录
function loadHistoryFromStorage() {
    try {
        const history = JSON.parse(localStorage.getItem(CHAT_STORAGE_KEY) || '[]');
        history.forEach(item => appendMessage(item, false));
    } catch (e) {
        console.error('加载历史记录失败:', e);
    }
}

// 页面加载时显示历史记录
loadHistoryFromStorage();

// 初始化背景图
const savedBg = localStorage.getItem('chatBg');
if (savedBg) {
    chat.style.backgroundImage = `url('${savedBg}')`;
    chat.style.backgroundSize = 'cover';
} else {
    chat.style.backgroundImage = `url('my-bg.jpg')`;
    chat.style.backgroundSize = 'cover';
}

// 初始化气泡样式
const savedStyle = localStorage.getItem('bubbleStyle') || 'rounded';
document.body.setAttribute('data-bubble', savedStyle);
bubbleSelect.value = savedStyle;

// emoji 面板拖拽
function makeDraggable(el) {
    let isDragging = false;
    let offsetX, offsetY;
    el.addEventListener('mousedown', e => {
        isDragging = true;
        offsetX = e.clientX - el.getBoundingClientRect().left;
        offsetY = e.clientY - el.getBoundingClientRect().top;
        el.style.cursor = 'move';
    });
    document.addEventListener('mousemove', e => {
        if (!isDragging) return;
        el.style.left = (e.clientX - offsetX) + 'px';
        el.style.top = (e.clientY - offsetY) + 'px';
        el.style.right = 'auto';
        el.style.bottom = 'auto';
        el.style.position = 'fixed';
    });
    document.addEventListener('mouseup', () => {
        isDragging = false;
        el.style.cursor = 'default';
    });
}
makeDraggable(emojiPicker);

// 表情选择
emojiBtn.addEventListener('click', () => {
    emojiPicker.style.display = emojiPicker.style.display === 'none' ? 'block' : 'none';
});
emojiPicker.addEventListener('emoji-click', (event) => {
    input.value += event.detail.unicode;
    input.focus();
});

// 设置菜单
settingsBtn.onclick = () => settingsMenu.classList.toggle('hidden');

// 气泡样式切换
bubbleSelect.onchange = () => {
    const style = bubbleSelect.value;
    localStorage.setItem('bubbleStyle', style);
    document.body.setAttribute('data-bubble', style);
};

// 显示消息
function appendMessage(data, saveToStorage = true) {
    const msg = document.createElement('div');
    msg.className = data.user === currentUser.username ? 'self' : (data.type === 'system' ? 'system' : 'other');

    // 为消息添加唯一ID（用于撤回功能）
    const messageId = data.messageId || `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    msg.setAttribute('data-message-id', messageId);

    // 为当前用户的消息添加右键菜单（包括文本消息和文件消息）
    if (data.user === currentUser.username && (data.type === 'message' || data.type === 'file')) {
        msg.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            showMessageContextMenu(e, messageId, data);
        });
    }

    if (data.type === 'system') {
        msg.textContent = data.text;
    } else if (data.type === 'message') {
        msg.textContent = `${data.user}: ${data.text}`;
    } else if (data.type === 'file') {
        msg.textContent = `${data.user} 发送了文件: `;
        if (data.fileType.startsWith('image/')) {
            const img = document.createElement('img');
            img.src = data.fileData;
            img.style.maxWidth = '200px';
            img.style.borderRadius = '10px';
            msg.appendChild(document.createElement('br'));
            msg.appendChild(img);
        } else {
            const a = document.createElement('a');
            a.href = data.fileData;
            a.download = data.fileName;
            a.textContent = data.fileName;
            msg.appendChild(a);
        }
    }

    chat.appendChild(msg);
    chat.scrollTop = chat.scrollHeight;

    // 保存到本地存储（除了系统消息）
    if (saveToStorage && data.type !== 'system') {
        saveMessageToStorage(data);
    }
}

// 显示消息右键菜单
function showMessageContextMenu(e, messageId, messageData) {
    // 移除已存在的右键菜单
    const existingMenu = document.querySelector('.message-context-menu');
    if (existingMenu) {
        existingMenu.remove();
    }

    // 创建右键菜单
    const menu = document.createElement('div');
    menu.className = 'message-context-menu';
    menu.style.position = 'fixed';
    menu.style.left = e.clientX + 'px';
    menu.style.top = e.clientY + 'px';
    menu.style.zIndex = '9999';

    // 检查消息是否在撤回时间范围内（2分钟内）
    const messageTime = messageData.time || Date.now();
    const canRecall = (Date.now() - messageTime) <= 2 * 60 * 1000; // 2分钟

    if (canRecall) {
        const recallBtn = document.createElement('div');
        recallBtn.className = 'context-menu-item';
        recallBtn.textContent = '撤回消息';
        recallBtn.addEventListener('click', () => {
            recallMessage(messageId, messageData);
            menu.remove();
        });
        menu.appendChild(recallBtn);
    }

    // 复制消息内容
    const copyBtn = document.createElement('div');
    copyBtn.className = 'context-menu-item';

    if (messageData.type === 'file') {
        copyBtn.textContent = '复制文件名';
        copyBtn.addEventListener('click', () => {
            navigator.clipboard.writeText(messageData.fileName || '');
            menu.remove();
        });
    } else {
        copyBtn.textContent = '复制消息';
        copyBtn.addEventListener('click', () => {
            navigator.clipboard.writeText(messageData.text || '');
            menu.remove();
        });
    }
    menu.appendChild(copyBtn);

    document.body.appendChild(menu);

    // 点击其他地方关闭菜单
    const closeMenu = (e) => {
        if (!menu.contains(e.target)) {
            menu.remove();
            document.removeEventListener('click', closeMenu);
        }
    };

    // 延迟添加事件监听器，避免立即触发
    setTimeout(() => {
        document.addEventListener('click', closeMenu);
    }, 100);
}

// 撤回消息
function recallMessage(messageId, messageData) {
    // 检查WebSocket连接状态
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        alert('连接已断开，正在尝试重连...');
        return;
    }

    try {
        // 发送撤回请求到服务器
        ws.send(JSON.stringify({
            type: 'recall_message',
            messageId: messageId,
            user: currentUser.username,
            originalMessage: messageData
        }));

        // 立即在本地显示撤回状态
        const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
        if (messageElement) {
            if (messageData.type === 'file') {
                messageElement.innerHTML = '<em style="color: #999; font-style: italic;">文件已撤回</em>';
            } else {
                messageElement.innerHTML = '<em style="color: #999; font-style: italic;">消息已撤回</em>';
            }
            messageElement.style.opacity = '0.6';
        }
    } catch (error) {
        console.error('撤回消息失败:', error);
        alert('撤回消息失败，请重试');
    }
}

// 处理撤回消息的响应
function handleRecallMessage(data) {
    const messageElement = document.querySelector(`[data-message-id="${data.messageId}"]`);
    if (messageElement) {
        // 根据消息类型显示不同的撤回文本
        const originalMessage = data.originalMessage || {};
        if (originalMessage.type === 'file') {
            messageElement.innerHTML = '<em style="color: #999; font-style: italic;">文件已撤回</em>';
        } else {
            messageElement.innerHTML = '<em style="color: #999; font-style: italic;">消息已撤回</em>';
        }
        messageElement.style.opacity = '0.6';
    }
}

// 用户列表更新
function updateUserList(users) {
    userList.innerHTML = '';
    users.forEach(user => {
        const li = document.createElement('li');

        // 创建用户头像
        const avatar = document.createElement('div');
        avatar.className = 'user-avatar';
        avatar.textContent = user.charAt(0).toUpperCase();

        // 创建用户信息容器
        const userInfo = document.createElement('div');
        userInfo.className = 'user-info';

        // 创建用户名
        const userName = document.createElement('div');
        userName.className = 'user-name';
        userName.textContent = user;

        // 创建在线状态
        const userStatus = document.createElement('div');
        userStatus.className = 'user-status';
        userStatus.textContent = '在线';

        // 组装用户信息
        userInfo.appendChild(userName);
        userInfo.appendChild(userStatus);

        // 组装列表项
        li.appendChild(avatar);
        li.appendChild(userInfo);

        // 如果是当前用户，添加特殊样式
        if (user === currentUser.username) {
            li.style.border = '2px solid #4CAF50';
            li.style.background = 'rgba(76, 175, 80, 0.1)';
        } else {
            // 为其他用户添加点击事件，发起私聊
            li.style.cursor = 'pointer';
            li.addEventListener('click', () => openPrivateChat(user));
        }

        userList.appendChild(li);
    });
}

// 私聊功能
function openPrivateChat(targetUser) {
    if (targetUser === currentUser.username) {
        alert('不能和自己私聊！');
        return;
    }

    if (isLocalMode) {
        alert('本地聊天模式不支持私聊功能');
        return;
    }

    const chatId = [currentUser.username, targetUser].sort().join('_');

    // 如果私聊窗口已存在，则显示它
    if (privateChatWindows.has(chatId)) {
        const window = privateChatWindows.get(chatId);
        window.style.display = 'flex';
        window.style.zIndex = getNextZIndex();
        return;
    }

    // 创建新的私聊窗口
    const chatWindow = createPrivateChatWindow(targetUser, chatId);
    privateChatWindows.set(chatId, chatWindow);

    // 初始化私聊消息数组
    if (!privateChats.has(chatId)) {
        privateChats.set(chatId, []);
    }

    // 将窗口添加到容器
    document.getElementById('private-chat-container').appendChild(chatWindow);

    // 加载历史消息
    loadPrivateChatHistory(chatId);
}

function createPrivateChatWindow(targetUser, chatId) {
    const window = document.createElement('div');
    window.className = 'private-chat-window';
    window.style.left = '20px';
    window.style.top = '20px';
    window.style.zIndex = getNextZIndex();

    // 计算窗口位置，避免重叠
    const existingWindows = document.querySelectorAll('.private-chat-window');
    const offset = existingWindows.length * 30;
    window.style.left = (20 + offset) + 'px';
    window.style.top = (20 + offset) + 'px';

    window.innerHTML = `
        <div class="private-chat-header">
            <div class="chat-title">与 ${targetUser} 私聊</div>
            <button class="close-btn" onclick="closePrivateChat('${chatId}')">&times;</button>
        </div>
        <div class="private-chat-messages" id="private-messages-${chatId}"></div>
        <div class="private-chat-input-area">
            <div class="input-row">
                <textarea id="private-input-${chatId}" placeholder="输入私聊消息..." rows="1"></textarea>
                <button onclick="sendPrivateMessage('${chatId}', '${targetUser}')">发送</button>
            </div>
        </div>
    `;

    // 绑定回车发送
    const textarea = window.querySelector(`#private-input-${chatId}`);
    textarea.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendPrivateMessage(chatId, targetUser);
        }
    });

    // 自动调整文本框高度
    textarea.addEventListener('input', () => {
        textarea.style.height = 'auto';
        textarea.style.height = Math.min(textarea.scrollHeight, 80) + 'px';
    });

    // 添加窗口拖拽功能
    makePrivateChatDraggable(window);

    return window;
}

// 私聊窗口拖拽功能
function makePrivateChatDraggable(windowEl) {
    const header = windowEl.querySelector('.private-chat-header');
    let isDragging = false;
    let offsetX, offsetY;

    header.addEventListener('mousedown', (e) => {
        if (e.target.classList.contains('close-btn')) return;
        isDragging = true;
        offsetX = e.clientX - windowEl.getBoundingClientRect().left;
        offsetY = e.clientY - windowEl.getBoundingClientRect().top;
        header.style.cursor = 'move';
        windowEl.style.zIndex = getNextZIndex();

        function onMouseMove(e) {
            if (!isDragging) return;
            const newX = e.clientX - offsetX;
            const newY = e.clientY - offsetY;
            const maxX = window.innerWidth - windowEl.offsetWidth;
            const maxY = window.innerHeight - windowEl.offsetHeight;
            windowEl.style.left = Math.max(0, Math.min(newX, maxX)) + 'px';
            windowEl.style.top = Math.max(0, Math.min(newY, maxY)) + 'px';
        }
        function onMouseUp() {
            isDragging = false;
            header.style.cursor = 'default';
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        }
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    });
}

function closePrivateChat(chatId) {
    const window = privateChatWindows.get(chatId);
    if (window) {
        window.remove();
        privateChatWindows.delete(chatId);
    }
}

function sendPrivateMessage(chatId, targetUser) {
    const textarea = document.getElementById(`private-input-${chatId}`);
    const message = textarea.value.trim();

    if (!message) return;

    // 检查WebSocket连接状态
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        alert('连接已断开，正在尝试重连...');
        return;
    }

    try {
        // 发送私聊消息
        ws.send(JSON.stringify({
            type: 'private_message',
            from: currentUser.username,
            to: targetUser,
            text: message
        }));

        // 清空输入框
        textarea.value = '';
        textarea.style.height = 'auto';

        // 添加消息到私聊窗口
        addPrivateMessage(chatId, currentUser.username, message, true);
    } catch (error) {
        console.error('发送私聊消息失败:', error);
        alert('发送私聊消息失败，请重试');
    }
}

function addPrivateMessage(chatId, sender, text, isSelf = false) {
    const messagesContainer = document.getElementById(`private-messages-${chatId}`);
    if (!messagesContainer) return;

    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${isSelf ? 'self' : 'other'}`;

    const time = new Date().toLocaleTimeString('zh-CN', {
        hour: '2-digit',
        minute: '2-digit'
    });

    messageDiv.innerHTML = `
        ${text}
        <span class="time">${time}</span>
    `;

    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;

    // 保存私聊消息到内存
    const messages = privateChats.get(chatId) || [];
    const messageObj = {
        sender,
        text,
        time: new Date().toISOString(),
        isSelf
    };
    messages.push(messageObj);
    privateChats.set(chatId, messages);

    // 保存到本地存储
    savePrivateMessageToStorage(chatId, messageObj);
}

function getNextZIndex() {
    const existingWindows = document.querySelectorAll('.private-chat-window');
    let maxZIndex = 1000;
    existingWindows.forEach(window => {
        const zIndex = parseInt(window.style.zIndex) || 1000;
        if (zIndex > maxZIndex) maxZIndex = zIndex;
    });
    return maxZIndex + 1;
}

// 加载私聊历史记录
function loadPrivateChatHistory(chatId) {
    const history = loadPrivateHistoryFromStorage(chatId);
    const messagesContainer = document.getElementById(`private-messages-${chatId}`);

    if (!messagesContainer) return;

    history.forEach(msg => {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${msg.isSelf ? 'self' : 'other'}`;

        const time = new Date(msg.time).toLocaleTimeString('zh-CN', {
            hour: '2-digit',
            minute: '2-digit'
        });

        messageDiv.innerHTML = `
            ${msg.text}
            <span class="time">${time}</span>
        `;

        messagesContainer.appendChild(messageDiv);
    });

    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// 本地聊天模式
let isLocalMode = false;
let localMessages = [];
let localUsers = new Set();

// 检查是否为GitHub Pages环境
function isGitHubPages() {
    return location.hostname.includes('github.io') || 
           location.hostname.includes('github.com') ||
           location.hostname.includes('netlify.app') ||
           location.hostname.includes('vercel.app');
}

// 初始化本地聊天模式
function initLocalChatMode() {
    isLocalMode = true;
    console.log('启用本地聊天模式');
    
    // 添加当前用户到本地用户列表
    localUsers.add(currentUser.username);
    
    // 显示本地模式提示
    appendMessage({ 
        type: 'system', 
        text: '🌐 本地聊天模式已启用（仅支持本地消息存储）' 
    }, false);
    
    // 模拟其他用户
    const mockUsers = ['小明', '小红', '小李', '小王'];
    mockUsers.forEach(user => {
        if (user !== currentUser.username) {
            localUsers.add(user);
        }
    });
    
    // 更新用户列表
    updateUserList(Array.from(localUsers));
    
    // 添加一些模拟消息
    const mockMessages = [
        { user: '小明', text: '大家好！', time: Date.now() - 60000 },
        { user: '小红', text: '你好！', time: Date.now() - 30000 },
        { user: '小李', text: '今天天气不错', time: Date.now() - 15000 }
    ];
    
    mockMessages.forEach(msg => {
        appendMessage({
            type: 'message',
            user: msg.user,
            text: msg.text,
            time: msg.time
        }, false);
    });
}

// 修改发送消息函数，支持本地模式
function sendMessage() {
    const val = input.value.trim();
    if (!val) return;

    // 生成消息ID
    const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    if (isLocalMode) {
        // 本地模式：直接添加到聊天记录
        const messageData = {
            type: "message",
            user: currentUser.username,
            text: val,
            messageId: messageId,
            time: Date.now()
        };
        
        appendMessage(messageData, true);
        input.value = '';
        
        // 模拟其他用户回复
        setTimeout(() => {
            const mockReplies = [
                '收到！',
                '好的',
                '明白了',
                '👍',
                '哈哈',
                '不错'
            ];
            const randomUser = Array.from(localUsers).find(u => u !== currentUser.username);
            const randomReply = mockReplies[Math.floor(Math.random() * mockReplies.length)];
            
            if (randomUser) {
                const replyData = {
                    type: "message",
                    user: randomUser,
                    text: randomReply,
                    messageId: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    time: Date.now()
                };
                appendMessage(replyData, true);
            }
        }, 1000 + Math.random() * 3000);
        
        return;
    }

    // 检查WebSocket连接状态
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        alert('连接已断开，正在尝试重连...');
        return;
    }

    try {
        ws.send(JSON.stringify({
            type: "message",
            user: currentUser.username,
            text: val,
            messageId: messageId,
            time: Date.now()
        }));
        input.value = '';
    } catch (error) {
        console.error('发送消息失败:', error);
        alert('发送消息失败，请重试');
    }
}
sendBtn.onclick = sendMessage;
input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

// 附件发送
attachBtn.onclick = () => {
    if (isLocalMode) {
        alert('本地聊天模式不支持文件发送功能');
        return;
    }
    fileInput.click();
};
fileInput.onchange = () => {
    const file = fileInput.files[0];
    if (!file) return;
    
    if (isLocalMode) {
        alert('本地聊天模式不支持文件发送功能');
        fileInput.value = '';
        return;
    }
    
    // 检查WebSocket连接状态
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        alert('连接已断开，正在尝试重连...');
        fileInput.value = '';
        return;
    }
    
    const reader = new FileReader();
    reader.onload = () => {
        // 生成文件消息ID
        const messageId = `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        try {
            ws.send(JSON.stringify({
                type: 'file',
                user: currentUser.username,
                fileName: file.name,
                fileType: file.type,
                fileData: reader.result,
                messageId: messageId,
                time: Date.now()
            }));
        } catch (error) {
            console.error('发送文件失败:', error);
            alert('发送文件失败，请重试');
        }
    };
    reader.readAsDataURL(file);
    fileInput.value = '';
};