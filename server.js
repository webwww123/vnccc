const express = require('express');
const cookieParser = require('cookie-parser');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const cors = require('cors');
const DockerManager = require('./docker-manager');
const TunnelManager = require('./tunnel-manager');

const app = express();
const PORT = process.env.PORT || 8001;

// 中间件
app.use(cors());
app.use(express.json());
app.use(cookieParser());
app.use(express.static('.'));

// 存储用户实例信息
const userInstances = new Map();
const instanceTimers = new Map();

// 系统限制配置
const MAX_INSTANCES = 50; // 最大实例数

// Docker和隧道管理器
const dockerManager = new DockerManager();
const tunnelManager = new TunnelManager();

// 生成或获取用户ID
function getUserId(req, res) {
    let userId = req.cookies.userId;
    if (!userId) {
        userId = uuidv4();
        res.cookie('userId', userId, { 
            maxAge: 24 * 60 * 60 * 1000, // 24小时
            httpOnly: true 
        });
    }
    return userId;
}

// 检查用户是否已有实例
function hasUserInstance(userId) {
    return userInstances.has(userId);
}

// 设置10分钟闲置回收定时器
function setIdleTimer(userId, instanceId) {
    // 清除现有定时器
    if (instanceTimers.has(userId)) {
        clearTimeout(instanceTimers.get(userId));
    }
    
    // 设置新的10分钟定时器
    const timer = setTimeout(async () => {
        console.log(`回收用户 ${userId} 的闲置实例 ${instanceId}`);
        await cleanupInstance(userId);
    }, 10 * 60 * 1000); // 10分钟
    
    instanceTimers.set(userId, timer);
}

// 重置闲置定时器
function resetIdleTimer(userId) {
    const instance = userInstances.get(userId);
    if (instance) {
        setIdleTimer(userId, instance.instanceId);
    }
}

// 清理实例
async function cleanupInstance(userId) {
    const instance = userInstances.get(userId);
    if (!instance) return;

    try {
        // 停止并删除Docker容器
        if (instance.containerId) {
            await dockerManager.removeContainer(instance.containerId);
        }

        // 清理Cloudflare隧道
        if (instance.tunnelId) {
            await tunnelManager.closeTunnel(instance.tunnelId);
        }

        // 清除定时器
        if (instanceTimers.has(userId)) {
            clearTimeout(instanceTimers.get(userId));
            instanceTimers.delete(userId);
        }

        // 删除实例记录
        userInstances.delete(userId);

        console.log(`实例 ${instance.instanceId} 已清理`);

    } catch (error) {
        console.error('清理实例时出错:', error);
    }
}

// API路由

// 获取系统状态
function getSystemStatus() {
    const onlineCount = userInstances.size;

    return {
        onlineCount,
        maxInstances: MAX_INSTANCES,
        systemStatus: onlineCount >= MAX_INSTANCES ? '容量已满' : '正常'
    };
}

// 检查用户状态
app.get('/api/user-status', (req, res) => {
    const userId = getUserId(req, res);
    const hasInstance = hasUserInstance(userId);

    let instanceInfo = null;
    if (hasInstance) {
        const instance = userInstances.get(userId);
        instanceInfo = {
            instanceId: instance.instanceId,
            vncUrl: instance.vncUrl,
            status: instance.status,
            createdAt: instance.createdAt
        };

        // 重置闲置定时器（用户访问了页面）
        resetIdleTimer(userId);
    }

    res.json({
        userId,
        hasInstance,
        instance: instanceInfo,
        systemStatus: getSystemStatus()
    });
});

// 获取系统状态API
app.get('/api/system-status', (req, res) => {
    res.json(getSystemStatus());
});

// 申请实例
app.post('/api/apply-instance', async (req, res) => {
    const userId = getUserId(req, res);
    const { instanceType } = req.body;

    // 检查用户是否已有实例
    if (hasUserInstance(userId)) {
        return res.status(400).json({
            success: false,
            error: '您已经申请过实例，每个用户只能申请一次'
        });
    }

    // 检查是否超过最大实例数
    if (userInstances.size >= MAX_INSTANCES) {
        return res.status(400).json({
            success: false,
            error: `系统容量已满，当前在线实例数: ${userInstances.size}/${MAX_INSTANCES}`
        });
    }

    const instanceId = `VNC-${Date.now().toString().substr(-6)}`;

    try {
        // 直接创建实例
        const instance = {
            instanceId,
            userId,
            instanceType,
            status: 'creating',
            createdAt: new Date().toISOString(),
            containerId: null,
            tunnelId: null,
            vncUrl: null
        };
        userInstances.set(userId, instance);

        res.json({
            success: true,
            instanceId,
            status: 'creating'
        });

        // 异步创建容器和隧道
        createInstanceAsync(userId, instanceId, instanceType);

    } catch (error) {
        console.error('申请实例时出错:', error);
        res.status(500).json({
            success: false,
            error: '服务器内部错误'
        });
    }
});

// 异步创建实例
async function createInstanceAsync(userId, instanceId, instanceType) {
    const instance = userInstances.get(userId);
    if (!instance) return;

    try {
        // 1. 创建Docker容器
        instance.status = 'creating_container';
        const containerInfo = await dockerManager.createVNCContainer(instanceId, instanceType);
        instance.containerId = containerInfo.id;
        instance.port = containerInfo.port;

        // 2. 创建Cloudflare隧道
        instance.status = 'creating_tunnel';
        const tunnelInfo = await tunnelManager.createTunnel(instanceId, containerInfo.port);
        instance.tunnelId = tunnelInfo.id;
        instance.vncUrl = tunnelInfo.url;

        // 3. 等待容器完全启动
        instance.status = 'starting';
        await dockerManager.waitForContainer(instance.containerId);

        // 4. 实例就绪
        instance.status = 'ready';

        // 5. 设置10分钟闲置回收定时器
        setIdleTimer(userId, instanceId);

        console.log(`实例 ${instanceId} 创建成功，VNC URL: ${instance.vncUrl}`);

    } catch (error) {
        console.error(`创建实例 ${instanceId} 时出错:`, error);
        instance.status = 'error';
        instance.error = error.message;

        // 清理已创建的资源
        await cleanupInstance(userId);
    }
}

// 获取实例状态
app.get('/api/instance-status/:instanceId', (req, res) => {
    const userId = getUserId(req, res);
    const instance = userInstances.get(userId);
    
    if (!instance || instance.instanceId !== req.params.instanceId) {
        return res.status(404).json({
            success: false,
            error: '实例不存在'
        });
    }
    
    // 重置闲置定时器
    resetIdleTimer(userId);
    
    res.json({
        success: true,
        instance: {
            instanceId: instance.instanceId,
            status: instance.status,
            vncUrl: instance.vncUrl,
            error: instance.error,
            createdAt: instance.createdAt
        }
    });
});

// 删除实例
app.post('/api/delete-instance', async (req, res) => {
    const userId = getUserId(req, res);
    const instance = userInstances.get(userId);

    if (!instance) {
        return res.status(404).json({
            success: false,
            error: '您没有正在运行的实例'
        });
    }

    try {
        console.log(`用户 ${userId} 请求删除实例 ${instance.instanceId}`);

        // 清理实例
        await cleanupInstance(userId);

        res.json({
            success: true,
            message: '实例已成功删除'
        });

    } catch (error) {
        console.error('删除实例时出错:', error);
        res.status(500).json({
            success: false,
            error: '删除实例失败'
        });
    }
});

// 心跳接口（防止闲置回收）
app.post('/api/heartbeat', (req, res) => {
    const userId = getUserId(req, res);
    const instance = userInstances.get(userId);

    if (instance) {
        resetIdleTimer(userId);
        res.json({ success: true });
    } else {
        res.status(404).json({ success: false, error: '实例不存在' });
    }
});

// 启动时清理所有现有进程
async function initializeSystem() {
    console.log('正在初始化系统...');

    // 清理所有cloudflared进程
    try {
        console.log('清理现有Cloudflare隧道进程...');
        await new Promise((resolve) => {
            const { exec } = require('child_process');
            exec('pkill -f cloudflared', (error) => {
                // 忽略错误，因为可能没有进程在运行
                console.log('Cloudflare隧道进程清理完成');
                resolve();
            });
        });
    } catch (error) {
        console.error('清理隧道进程时出错:', error);
    }

    // 等待Docker管理器初始化完成
    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log('系统初始化完成');
}

// 启动服务器
app.listen(PORT, async () => {
    console.log(`VNC实例申请系统运行在端口 ${PORT}`);
    console.log(`访问地址: http://localhost:${PORT}`);

    // 初始化系统
    await initializeSystem();
});

// 优雅关闭
process.on('SIGTERM', async () => {
    console.log('正在关闭服务器...');
    
    // 清理所有实例
    for (const [userId] of userInstances) {
        await cleanupInstance(userId);
    }
    
    process.exit(0);
});
