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
if ! command -v python3 >/dev/null 2>&1; then
    echo "⚠️ Python3未找到，正在安装..."
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -qq >/dev/null 2>&1
    apt-get install -y python3 >/dev/null 2>&1
    echo "✅ Python3安装完成"
else
    echo "✅ Python3可用"
fi

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
    
    # 创建假的sys文件系统结构
    echo "🛡️ 创建假的sys文件系统..."
    if [ -d /sys/devices/system/cpu ]; then
        # 先备份原始目录结构
        cp -r /sys/devices/system/cpu /tmp/cpu_backup 2>/dev/null || true

        # 用tmpfs覆盖
        mount -t tmpfs tmpfs /sys/devices/system/cpu 2>/dev/null || true

        # 创建假的CPU目录结构（24个CPU）
        for i in $(seq 0 23); do
            mkdir -p /sys/devices/system/cpu/cpu$i
            echo 1 > /sys/devices/system/cpu/cpu$i/online 2>/dev/null || true
        done

        # 创建online文件
        echo "0-23" > /sys/devices/system/cpu/online 2>/dev/null || true
        echo "0-23" > /sys/devices/system/cpu/present 2>/dev/null || true
        echo "0-23" > /sys/devices/system/cpu/possible 2>/dev/null || true

        echo "✅ 创建了24个假CPU目录"
    fi

    # 修复nproc的cgroup cpuset问题 (使用bind mount)
    echo "🔧 修复nproc的cgroup cpuset..."

    # 创建假的cgroup文件
    mkdir -p /tmp/fake_cgroup
    echo "0-23" > /tmp/fake_cgroup/cpuset.cpus.effective
    echo "0-23" > /tmp/fake_cgroup/cpuset.cpus

    # cgroup v1路径
    if [ -f /sys/fs/cgroup/cpuset/cpuset.cpus ]; then
        mount --bind /tmp/fake_cgroup/cpuset.cpus /sys/fs/cgroup/cpuset/cpuset.cpus 2>/dev/null || true
        echo "✅ 修复了cgroup v1 cpuset"
    fi

    # cgroup v2路径 - bind mount覆盖
    if [ -f /sys/fs/cgroup/cpuset.cpus.effective ]; then
        mount --bind /tmp/fake_cgroup/cpuset.cpus.effective /sys/fs/cgroup/cpuset.cpus.effective 2>/dev/null || true
        echo "✅ 修复了cgroup v2 cpuset.cpus.effective"
    fi

    if [ -f /sys/fs/cgroup/cpuset.cpus ]; then
        mount --bind /tmp/fake_cgroup/cpuset.cpus /sys/fs/cgroup/cpuset.cpus 2>/dev/null || true
        echo "✅ 修复了cgroup v2 cpuset.cpus"
    fi

    # 创建nproc wrapper来修复CPU检测
    echo "🎯 创建nproc wrapper..."

    # 备份原始nproc
    if [ -f /usr/bin/nproc ]; then
        cp /usr/bin/nproc /usr/bin/nproc.orig

        # 创建新的nproc脚本
        cat > /usr/bin/nproc << 'EOF'
#!/bin/bash
# 假的nproc，总是返回24核
if [ "$1" = "--all" ]; then
    echo "24"
else
    echo "24"
fi
EOF
        chmod +x /usr/bin/nproc
        echo "✅ nproc wrapper创建成功"
    fi

    # 隐藏固件信息
    if [ -d /sys/firmware ]; then
        mount -t tmpfs tmpfs /sys/firmware -o ro,nosuid,nodev,noexec 2>/dev/null || true
    fi
    
    echo "🎉 硬件伪造设置完成!"
    echo "📊 最终验证:"
    echo "CPU核心数: $(grep -c "^processor" /proc/cpuinfo)"
    echo "CPU型号: $(grep "^model name" /proc/cpuinfo | head -1 | cut -d: -f2 | xargs)"
    echo "内存大小: $(grep "^MemTotal:" /proc/meminfo | awk "{print \$2/1024/1024 \"GB\"}")"
    
    # 🔒 收回危险权限并启动服务
    echo "🔒 收回危险权限并启动服务..."

    # 确保PATH包含/usr/sbin
    export PATH="/usr/sbin:/usr/bin:/sbin:/bin:$PATH"

    # 确保capsh可用
    if ! command -v capsh >/dev/null 2>&1; then
        echo "⚠️ capsh未找到，正在安装libcap2-bin..."
        export DEBIAN_FRONTEND=noninteractive
        export TZ=Etc/UTC

        # 修复用户命名空间中的apt权限问题
        echo "🔧 修复用户命名空间中的apt权限..."
        echo "APT::Sandbox::User \"root\";" > /etc/apt/apt.conf.d/99sandbox

        # 挂载tmpfs到apt缓存目录解决权限问题
        mount -t tmpfs tmpfs /var/cache/apt/archives 2>/dev/null || true
        mount -t tmpfs tmpfs /var/lib/apt/lists 2>/dev/null || true

        apt-get update -qq
        apt-get install -y --no-install-recommends libcap2-bin

        # 验证安装结果 - capsh通常在/usr/sbin/capsh
        if [ -x "/usr/sbin/capsh" ]; then
            echo "✅ capsh安装成功: /usr/sbin/capsh"
        elif command -v capsh >/dev/null 2>&1; then
            echo "✅ capsh安装成功: $(which capsh)"
        else
            echo "❌ capsh安装失败"
            ls -la /usr/sbin/cap* 2>/dev/null || echo "未找到cap*文件"
            exit 1
        fi
    else
        echo "✅ capsh已可用: $(which capsh)"
    fi

    # 执行权限收回
    echo "🔒 执行权限收回..."
    exec /usr/sbin/capsh --drop=cap_sys_admin -- -c "exec /startup.sh"
'
