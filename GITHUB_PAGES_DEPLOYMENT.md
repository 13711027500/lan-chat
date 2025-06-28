# GitHub Pages 部署指南

## 问题说明

GitHub Pages 只支持静态文件托管，不支持 Node.js 服务器运行。因此，当你的聊天应用部署到 GitHub Pages 时，WebSocket 连接会失败，导致无法发送消息。

## 解决方案

我已经为你的应用添加了**本地聊天模式**，当检测到 GitHub Pages 环境时，会自动启用此模式。

### 本地聊天模式功能

✅ **支持的功能：**
- 发送和接收消息
- 本地消息存储
- 模拟其他用户回复
- 表情支持
- 自定义主题
- 响应式设计

❌ **不支持的功能：**
- 实时多人聊天
- 文件传输
- 私聊功能
- 用户认证

## 部署步骤

### 1. 准备文件

确保你的 `public` 文件夹包含以下文件：
- `index.html`
- `login.html`
- `script.js`
- `style.css`

### 2. 推送到 GitHub

```bash
# 初始化 Git 仓库（如果还没有）
git init

# 添加文件
git add .

# 提交更改
git commit -m "Add GitHub Pages support"

# 推送到 GitHub
git push origin main
```

### 3. 启用 GitHub Pages

1. 进入你的 GitHub 仓库
2. 点击 "Settings" 标签
3. 滚动到 "Pages" 部分
4. 在 "Source" 中选择 "Deploy from a branch"
5. 选择分支（通常是 `main` 或 `master`）
6. 选择文件夹（选择 `/` 根目录）
7. 点击 "Save"

### 4. 等待部署

GitHub Pages 会自动构建和部署你的应用。通常需要几分钟时间。

### 5. 访问应用

部署完成后，你会得到一个类似这样的网址：
`https://your-username.github.io/your-repo-name/`

## 使用说明

### 首次访问

1. 打开你的 GitHub Pages 网址
2. 系统会提示是否以游客身份进入
3. 点击 "确定" 进入游客模式
4. 输入昵称（或使用默认的"匿名用户"）

### 聊天功能

- **发送消息**：在输入框中输入文字，按回车或点击发送按钮
- **模拟回复**：系统会自动模拟其他用户回复你的消息
- **本地存储**：消息会保存在浏览器本地存储中
- **表情支持**：点击表情按钮选择表情

### 主题设置

- 点击设置按钮可以自定义聊天气泡样式
- 支持圆角、方形、尖角等样式

## 技术实现

### 环境检测

应用会自动检测运行环境：

```javascript
function isGitHubPages() {
    return location.hostname.includes('github.io') || 
           location.hostname.includes('github.com') ||
           location.hostname.includes('netlify.app') ||
           location.hostname.includes('vercel.app');
}
```

### 本地模式

当检测到 GitHub Pages 环境时，应用会：

1. 跳过 WebSocket 连接
2. 启用本地消息存储
3. 模拟其他用户
4. 显示本地模式提示

### 消息模拟

系统会随机模拟其他用户的回复：

```javascript
const mockReplies = [
    '收到！',
    '好的',
    '明白了',
    '👍',
    '哈哈',
    '不错'
];
```

## 故障排除

### 页面无法加载

1. 检查 GitHub Pages 是否已启用
2. 确认文件路径正确
3. 查看 GitHub Actions 构建日志

### 消息无法发送

1. 检查浏览器控制台错误
2. 确认 JavaScript 文件正确加载
3. 尝试刷新页面

### 样式问题

1. 确认 CSS 文件路径正确
2. 检查浏览器兼容性
3. 清除浏览器缓存

## 升级到完整版本

如果你需要完整的聊天功能（实时多人聊天、文件传输、私聊等），需要部署到支持 Node.js 的服务器：

### 推荐平台

1. **Vercel** - 免费，支持 Node.js
2. **Netlify** - 免费，支持服务器函数
3. **Railway** - 免费额度，支持 Node.js
4. **Heroku** - 付费，功能完整

### 部署步骤

1. 将代码推送到 GitHub
2. 在平台中连接 GitHub 仓库
3. 配置环境变量
4. 部署应用

## 注意事项

1. **隐私**：本地聊天模式的消息只存储在浏览器中
2. **兼容性**：确保使用现代浏览器
3. **存储限制**：浏览器本地存储有大小限制
4. **更新**：代码更新后需要重新部署

## 支持

如果遇到问题，请：

1. 检查浏览器控制台错误信息
2. 查看 GitHub Pages 构建日志
3. 确认文件路径和权限正确
4. 尝试清除浏览器缓存 