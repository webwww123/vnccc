const express = require('express');
const cookieParser = require('cookie-parser');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const cors = require('cors');
const DockerManager = require('./docker-manager');
const TunnelManager = require('./tunnel-manager');

const app = express();
const PORT = process.env.PORT || 8000;

// 中间件
app.use(cors());
app.use(express.json());
app.use(cookieParser());
app.use(express.static('.'));

// 存储用户实例信息
const userInstances = new Map();
const instanceTimers = new Map();

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
        await dockerManager.removeContainer(instance.containerId);
        
        // 清理Cloudflare隧道
        await tunnelManager.closeTunnel(instance.tunnelId);
        
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
        instance: instanceInfo
    });
});

// 申请实例
app.post('/api/apply-instance', async (req, res) => {
    const userId = getUserId(req, res);
    
    // 检查用户是否已有实例
    if (hasUserInstance(userId)) {
        return res.status(400).json({
            success: false,
            error: '您已经申请过实例，每个用户只能申请一次'
        });
    }
    
    const instanceId = `VNC-${Date.now().toString().substr(-6)}`;
    
    try {
        // 更新实例状态为创建中
        const instance = {
            instanceId,
            userId,
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
        createInstanceAsync(userId, instanceId);
        
    } catch (error) {
        console.error('申请实例时出错:', error);
        res.status(500).json({
            success: false,
            error: '服务器内部错误'
        });
    }
});

// 异步创建实例
async function createInstanceAsync(userId, instanceId) {
    const instance = userInstances.get(userId);
    if (!instance) return;
    
    try {
        // 1. 创建Docker容器
        instance.status = 'creating_container';
        const containerInfo = await dockerManager.createVNCContainer(instanceId);
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

// 启动服务器
app.listen(PORT, () => {
    console.log(`VNC实例申请系统运行在端口 ${PORT}`);
    console.log(`访问地址: http://localhost:${PORT}`);
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
