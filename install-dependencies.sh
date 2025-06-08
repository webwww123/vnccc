#!/bin/bash

# VNC实例申请系统 - 依赖安装脚本
echo "=== VNC实例申请系统 - 依赖安装脚本 ==="
echo ""

# 检查是否为root用户
if [ "$EUID" -ne 0 ]; then
    echo "请使用root权限运行此脚本: sudo $0"
    exit 1
fi

# 更新包管理器
echo "1. 更新包管理器..."
apt update

# 安装Docker
echo ""
echo "2. 检查Docker安装状态..."
if command -v docker &> /dev/null; then
    echo "✓ Docker已安装"
    docker --version
else
    echo "正在安装Docker..."
    
    # 安装必要的包
    apt install -y apt-transport-https ca-certificates curl gnupg lsb-release
    
    # 添加Docker官方GPG密钥
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
    
    # 添加Docker仓库
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
    
    # 更新包索引
    apt update
    
    # 安装Docker Engine
    apt install -y docker-ce docker-ce-cli containerd.io
    
    # 启动Docker服务
    systemctl start docker
    systemctl enable docker
    
    echo "✓ Docker安装完成"
fi

# 安装cloudflared
echo ""
echo "3. 检查cloudflared安装状态..."
if command -v cloudflared &> /dev/null; then
    echo "✓ cloudflared已安装"
    cloudflared --version
else
    echo "正在安装cloudflared..."

    # 下载cloudflared二进制文件
    wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -O /tmp/cloudflared

    # 设置执行权限并移动到系统路径
    chmod +x /tmp/cloudflared
    mv /tmp/cloudflared /usr/local/bin/cloudflared

    # 创建符号链接以确保在PATH中可用
    ln -sf /usr/local/bin/cloudflared /usr/bin/cloudflared

    echo "✓ cloudflared安装完成"
    cloudflared --version
fi

# 安装Node.js (如果需要)
echo ""
echo "4. 检查Node.js安装状态..."
if command -v node &> /dev/null; then
    echo "✓ Node.js已安装"
    node --version
    npm --version
else
    echo "正在安装Node.js..."
    
    # 安装NodeSource仓库
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
    
    # 安装Node.js
    apt install -y nodejs
    
    echo "✓ Node.js安装完成"
fi

# 拉取VNC镜像
echo ""
echo "5. 拉取VNC Docker镜像..."
docker pull dorowu/ubuntu-desktop-lxde-vnc:latest

echo ""
echo "=== 安装完成 ==="
echo ""
echo "现在您可以运行以下命令启动VNC实例申请系统："
echo "  npm install"
echo "  npm start"
echo ""
echo "然后访问: http://localhost:8000"
echo ""
echo "注意事项："
echo "- 确保Docker服务正在运行"
echo "- 确保有足够的磁盘空间存储Docker镜像"
echo "- 确保网络连接正常以创建Cloudflare隧道"
echo ""
