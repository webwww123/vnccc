#!/bin/bash
set -e

echo "🚀 启动Web终端服务..."

# 更新包管理器并安装必要软件
echo "📦 安装ttyd和依赖..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq >/dev/null 2>&1
apt-get install -y wget curl >/dev/null 2>&1

# 下载并安装ttyd
echo "⬇️ 下载ttyd..."
wget -q https://github.com/tsl0922/ttyd/releases/download/1.7.3/ttyd.x86_64 -O /usr/local/bin/ttyd
chmod +x /usr/local/bin/ttyd

echo "✅ ttyd安装完成"

# 等待硬件伪造完成
sleep 2

# 启动ttyd Web终端服务
echo "🌐 启动Web终端服务..."
exec /usr/local/bin/ttyd -p 7681 -i 0.0.0.0 -W bash
