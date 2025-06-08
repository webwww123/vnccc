# VNC实例申请系统

一个上世纪风格的VNC实例申请系统，支持一键创建Ubuntu桌面环境并通过Cloudflare隧道提供外网访问。

## 功能特点

- 🖥️ **Ubuntu桌面环境**: 基于 `dorowu/ubuntu-desktop-lxde-vnc` 镜像
- 🌐 **Cloudflare隧道**: 自动创建隧道提供外网访问
- 🍪 **Cookie用户识别**: 基于Cookie区分用户，无需注册
- 🚫 **一人一实例**: 每个用户只能申请一次实例
- ⏰ **自动回收**: 闲置10分钟后自动回收实例
- 🎨 **上世纪风格**: 怀旧的界面设计

## 系统要求

- Linux系统 (推荐Ubuntu 20.04+)
- Docker
- Node.js 16+
- cloudflared
- 至少2GB可用内存
- 稳定的网络连接

## 快速安装

### 1. 克隆项目
```bash
git clone <repository-url>
cd vnccc
```

### 2. 安装依赖
```bash
# 使用自动安装脚本 (需要root权限)
sudo ./install-dependencies.sh

# 或手动安装
sudo apt update
sudo apt install docker.io nodejs npm
wget https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared-linux-amd64.deb
```

### 3. 安装Node.js依赖
```bash
npm install
```

### 4. 启动服务
```bash
npm start
# 或
node server.js
```

### 5. 访问系统
打开浏览器访问: http://localhost:8000

## 使用说明

### 申请实例
1. 访问系统主页
2. 点击"申请实例"按钮（只有24v64g配置可用）
3. 等待2-3分钟创建过程
4. 获得VNC访问链接

### 访问VNC桌面
- **Web界面**: 点击系统提供的链接（推荐）
- **VNC客户端**: 使用VNC客户端连接到提供的地址

### 实例管理
- 每个用户只能申请一次实例
- 实例闲置10分钟后自动回收
- 无法手动删除实例
- 访问页面会重置闲置计时器

## 技术架构

```
用户浏览器 → Node.js服务器 → Docker容器 → Cloudflare隧道 → 外网访问
```

### 核心组件
- **server.js**: 主服务器，处理API请求和用户管理
- **docker-manager.js**: Docker容器管理
- **tunnel-manager.js**: Cloudflare隧道管理
- **前端**: 上世纪风格的HTML/CSS/JS界面

### API接口
- `GET /api/user-status`: 获取用户状态
- `POST /api/apply-instance`: 申请实例
- `GET /api/instance-status/:id`: 获取实例状态
- `POST /api/heartbeat`: 发送心跳防止回收

## 配置说明

### 环境变量
```bash
PORT=8000                    # 服务端口
DOCKER_HOST=unix:///var/run/docker.sock  # Docker连接
```

### 实例配置
- **镜像**: dorowu/ubuntu-desktop-lxde-vnc:latest
- **内存限制**: 2GB
- **CPU权重**: 1024
- **端口映射**: 动态分配
- **VNC访问**: 无密码（直接访问）
- **分辨率**: 1024x768

## 故障排除

### 常见问题

1. **Docker权限错误**
   ```bash
   sudo usermod -aG docker $USER
   # 重新登录或重启
   ```

2. **端口被占用**
   ```bash
   sudo netstat -tlnp | grep :8000
   sudo kill -9 <PID>
   ```

3. **cloudflared未找到**
   ```bash
   which cloudflared
   sudo ln -s /usr/local/bin/cloudflared /usr/bin/cloudflared
   ```

4. **镜像拉取失败**
   ```bash
   docker pull dorowu/ubuntu-desktop-lxde-vnc:latest
   ```

### 日志查看
```bash
# 服务器日志
node server.js

# Docker容器日志
docker logs <container-id>

# 系统日志
journalctl -u docker
```

## 开发说明

### 项目结构
```
vnccc/
├── server.js              # 主服务器
├── docker-manager.js      # Docker管理
├── tunnel-manager.js      # 隧道管理
├── index.html             # 主页面
├── style.css              # 样式文件
├── script.js              # 前端脚本
├── package.json           # 项目配置
├── install-dependencies.sh # 安装脚本
└── README.md              # 说明文档
```

### 开发模式
```bash
npm install -g nodemon
npm run dev
```

## 安全注意事项

- VNC实例配置为无密码访问，任何获得链接的人都可以访问
- Cloudflare隧道提供HTTPS加密
- 建议在防火墙后运行
- 定期清理Docker镜像和容器
- 隧道链接具有随机性，但仍建议谨慎分享

## 许可证

MIT License

## 贡献

欢迎提交Issue和Pull Request！

---

© 1999 VNC云计算公司 版权所有
