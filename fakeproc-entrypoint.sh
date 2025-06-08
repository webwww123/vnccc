#!/bin/bash
set -e

echo "🚀 启动硬件伪造入口脚本..."

# 检查必需的环境变量
if [ -z "$INSTANCE_TYPE" ]; then
    echo "❌ 错误: INSTANCE_TYPE 环境变量未设置"
    exit 1
fi

echo "📋 实例类型: $INSTANCE_TYPE"

# 检查Python环境
echo "📦 检查Python环境..."
# 跳过apt更新，使用镜像已有的python3
if ! command -v python3 >/dev/null 2>&1; then
    echo "❌ Python3未找到"
    exit 1
fi
echo "✅ Python3可用"

# 生成配置文件
echo "⚙️ 生成硬件配置..."
/specgen "$INSTANCE_TYPE" > /etc/fake.json

echo "📄 生成的配置:"
cat /etc/fake.json

# 创建挂载点
mkdir -p /fake

echo "🔧 启动用户命名空间和挂载命名空间..."

# 使用unshare创建新的用户和挂载命名空间
exec unshare -Urmpf bash -c '
    echo "🔒 在新的命名空间中运行 (PID: $$)"
    
    # 创建静态假procfs文件
    echo "🚀 创建静态假procfs文件..."
    if [ -f /create-fake-proc.py ]; then
        python3 /create-fake-proc.py
    else
        echo "❌ /create-fake-proc.py 文件不存在"
        ls -la /create-fake-proc.py
        exit 1
    fi
    
    # 验证静态文件内容
    echo "🔍 验证静态文件内容..."
    if [ -f /fake/cpuinfo ]; then
        echo "✅ cpuinfo文件存在"
        echo "CPU核心数: $(grep -c "^processor" /fake/cpuinfo)"
    else
        echo "❌ cpuinfo文件不存在"
        exit 1
    fi

    if [ -f /fake/meminfo ]; then
        echo "✅ meminfo文件存在"
        echo "内存大小: $(grep "^MemTotal:" /fake/meminfo)"
    else
        echo "❌ meminfo文件不存在"
        exit 1
    fi
    
    # 使用bind mount替换关键的/proc文件
    echo "🔄 替换关键的/proc文件..."
    mount --bind /fake/cpuinfo /proc/cpuinfo
    mount --bind /fake/meminfo /proc/meminfo
    
    if [ $? -eq 0 ]; then
        echo "✅ /proc替换成功"
    else
        echo "❌ /proc替换失败"
        exit 1
    fi
    
    # 验证替换效果
    echo "🔍 验证/proc替换效果..."
    if grep -q "Intel.*Xeon.*Gold" /proc/cpuinfo; then
        echo "✅ CPU信息伪造成功"
    else
        echo "❌ CPU信息伪造失败"
        head -5 /proc/cpuinfo
    fi
    
    # 隐藏真实硬件信息路径
    echo "🛡️ 隐藏真实硬件信息..."
    if [ -d /sys/devices/system/cpu ]; then
        mount -t tmpfs tmpfs /sys/devices/system/cpu -o ro,nosuid,nodev,noexec 2>/dev/null || true
    fi
    
    if [ -d /sys/firmware ]; then
        mount -t tmpfs tmpfs /sys/firmware -o ro,nosuid,nodev,noexec 2>/dev/null || true
    fi
    
    echo "🎉 硬件伪造设置完成!"
    echo "📊 最终验证:"
    echo "CPU核心数: $(grep -c "^processor" /proc/cpuinfo)"
    echo "CPU型号: $(grep "^model name" /proc/cpuinfo | head -1 | cut -d: -f2 | xargs)"
    echo "内存大小: $(grep "^MemTotal:" /proc/meminfo | awk "{print \$2/1024/1024 \"GB\"}")"
    
    # 启动原始VNC服务 (让tini/supervisord接管)
    echo "🚀 启动VNC服务..."
    exec /startup.sh
'
