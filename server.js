const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');
const express = require('express');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const app = express();
const server = http.createServer(app);

// 中间件
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

// 配置
const JWT_SECRET = 'your-secret-key-change-this-in-production';
const USERS_FILE = './users.json';
const SALT_ROUNDS = 10;

// 用户数据管理
let users = {};

// 加载用户数据
function loadUsers() {
    try {
        if (fs.existsSync(USERS_FILE)) {
            const data = fs.readFileSync(USERS_FILE, 'utf8');
            users = JSON.parse(data);
        }
    } catch (e) {
        console.error('加载用户数据失败:', e);
        users = {};
    }
}

// 保存用户数据
function saveUsers() {
    try {
        fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
    } catch (e) {
        console.error('保存用户数据失败:', e);
    }
}

// 初始化加载用户数据
loadUsers();

// 自动补全老用户缺失字段
function fixUserFields() {
  for (const u of Object.values(users)) {
    // 移除好友相关字段
  }
}
fixUserFields();

// 生成JWT令牌
function generateToken(userId) {
    return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '24h' });
}

// 验证JWT令牌
function verifyToken(token) {
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch (e) {
        return null;
    }
}

// 用户注册API
app.post('/api/register', async (req, res) => {
    try {
        const { username, password, email } = req.body;
        
        // 验证输入
        if (!username || !password) {
            return res.status(400).json({ error: '用户名和密码不能为空' });
        }
        
        if (username.length < 3 || username.length > 20) {
            return res.status(400).json({ error: '用户名长度必须在3-20个字符之间' });
        }
        
        if (password.length < 6) {
            return res.status(400).json({ error: '密码长度至少6个字符' });
        }
        
        // 检查用户名是否已存在
        if (users[username]) {
            return res.status(400).json({ error: '用户名已存在' });
        }
        
        // 加密密码
        const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
        
        // 创建用户
        users[username] = {
            username,
            password: hashedPassword,
            email: email || '',
            createdAt: new Date().toISOString(),
            lastLogin: null
        };
        
        // 保存用户数据
        saveUsers();
        
        // 生成令牌
        const token = generateToken(username);
        
        res.json({ 
            success: true, 
            message: '注册成功',
            token,
            user: { username, email: users[username].email }
        });
        
    } catch (error) {
        console.error('注册错误:', error);
        res.status(500).json({ error: '服务器错误' });
    }
});

// 用户登录API
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        // 验证输入
        if (!username || !password) {
            return res.status(400).json({ error: '用户名和密码不能为空' });
        }
        
        // 检查用户是否存在
        const user = users[username];
        if (!user) {
            return res.status(401).json({ error: '用户名或密码错误' });
        }
        
        // 验证密码
        const isValidPassword = await bcrypt.compare(password, user.password);
        if (!isValidPassword) {
            return res.status(401).json({ error: '用户名或密码错误' });
        }
        
        // 更新最后登录时间
        user.lastLogin = new Date().toISOString();
        saveUsers();
        
        // 生成令牌
        const token = generateToken(username);
        
        res.json({ 
            success: true, 
            message: '登录成功',
            token,
            user: { username, email: user.email }
        });
        
    } catch (error) {
        console.error('登录错误:', error);
        res.status(500).json({ error: '服务器错误' });
    }
});

// 验证令牌API
app.post('/api/verify', (req, res) => {
    try {
        const { token } = req.body;
        
        if (!token) {
            return res.status(401).json({ error: '令牌无效' });
        }
        
        const decoded = verifyToken(token);
        if (!decoded) {
            return res.status(401).json({ error: '令牌无效或已过期' });
        }
        
        const user = users[decoded.userId];
        if (!user) {
            return res.status(401).json({ error: '用户不存在' });
        }
        
        res.json({ 
            success: true, 
            user: { username: user.username, email: user.email }
        });
        
    } catch (error) {
        console.error('验证令牌错误:', error);
        res.status(500).json({ error: '服务器错误' });
    }
});

// 获取用户信息API
app.get('/api/user/:username', (req, res) => {
    try {
        const { username } = req.params;
        const user = users[username];
        
        if (!user) {
            return res.status(404).json({ error: '用户不存在' });
        }
        
        // 不返回密码
        const { password, ...userInfo } = user;
        res.json(userInfo);
        
    } catch (error) {
        console.error('获取用户信息错误:', error);
        res.status(500).json({ error: '服务器错误' });
    }
});

// 根路径重定向到登录页面
app.get('/', (req, res) => {
    res.redirect('/login.html');
});

const userMap = new Map(); // 连接(ws) -> 用户名

// WebSocket 服务
const wss = new WebSocket.Server({ server });

function broadcast(data, exceptWs = null) {
  const str = JSON.stringify(data);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN && client !== exceptWs) {
      client.send(str);
    }
  });
}

function broadcastUserList() {
  const users = Array.from(userMap.values());
  const data = { type: 'users', list: users };
  broadcast(data);
}

wss.on('connection', (ws) => {
  ws.on('message', (msg) => {
    let data;
    try {
      data = JSON.parse(msg);
    } catch {
      return;
    }

    if (data.type === 'join') {
      // 验证用户令牌
      if (data.token) {
        const decoded = verifyToken(data.token);
        if (decoded && users[decoded.userId]) {
          userMap.set(ws, decoded.userId);
          broadcast({ type: 'join', user: decoded.userId }, ws);
          broadcastUserList();
        } else {
          ws.send(JSON.stringify({ type: 'error', message: '身份验证失败' }));
        }
      } else {
        // 兼容匿名用户
        userMap.set(ws, data.user);
        broadcast({ type: 'join', user: data.user }, ws);
        broadcastUserList();
      }
    }

    if (data.type === 'message') {
      const msgObj = {
        type: 'message',
        user: data.user,
        text: data.text,
        messageId: data.messageId,
        time: data.time || Date.now()
      };
      broadcast(msgObj);
    }

    if (data.type === 'file') {
      const fileMsg = {
        type: 'file',
        user: data.user,
        fileName: data.fileName,
        fileType: data.fileType,
        fileData: data.fileData,
        messageId: data.messageId,
        time: data.time || Date.now()
      };
      broadcast(fileMsg);
    }

    if (data.type === 'private_message') {
      // 处理私聊消息
      const fromUser = data.from;
      const toUser = data.to;
      
      // 查找目标用户的WebSocket连接
      let targetWs = null;
      for (const [clientWs, username] of userMap.entries()) {
        if (username === toUser) {
          targetWs = clientWs;
          break;
        }
      }
      
      // 发送私聊消息给目标用户
      if (targetWs && targetWs.readyState === WebSocket.OPEN) {
        const privateMsg = {
          type: 'private_message',
          from: fromUser,
          to: toUser,
          text: data.text,
          time: Date.now()
        };
        targetWs.send(JSON.stringify(privateMsg));
      }
      
      // 同时发送给发送者（用于确认）
      const senderWs = ws;
      if (senderWs && senderWs.readyState === WebSocket.OPEN) {
        const confirmMsg = {
          type: 'private_message',
          from: fromUser,
          to: toUser,
          text: data.text,
          time: Date.now()
        };
        senderWs.send(JSON.stringify(confirmMsg));
      }
    }

    if (data.type === 'recall_message') {
      // 处理撤回消息
      const messageId = data.messageId;
      const user = data.user;
      
      // 验证用户身份
      if (userMap.get(ws) !== user) {
        ws.send(JSON.stringify({ type: 'error', message: '无权撤回此消息' }));
        return;
      }
      
      // 广播撤回消息给所有用户
      const recallMsg = {
        type: 'recall_message',
        messageId: messageId,
        user: user,
        time: Date.now()
      };
      broadcast(recallMsg);
    }
  });

  ws.on('close', () => {
    const user = userMap.get(ws);
    if (user) {
      broadcast({ type: 'leave', user });
      userMap.delete(ws);
      broadcastUserList();
    }
  });
});

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

server.listen(PORT, HOST, () => {
  console.log(`服务器运行在 http://${HOST}:${PORT}`);
  console.log('WebSocket 服务已启动');
});
