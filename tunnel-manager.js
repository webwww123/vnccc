const { spawn } = require('child_process');
const axios = require('axios');

class TunnelManager {
    constructor() {
        this.tunnels = new Map(); // 存储隧道信息
        this.cloudflaredPath = '/usr/local/bin/cloudflared'; // cloudflared 可执行文件路径
    }

    // 创建Cloudflare隧道
    async createTunnel(instanceId, localPort) {
        const tunnelName = `vnc-${instanceId}`;

        try {
            console.log(`正在为实例 ${instanceId} 创建Cloudflare隧道，本地端口: ${localPort}`);

            // 检查cloudflared是否可用
            await this.checkCloudflaredAvailable();

            // 启动隧道
            const tunnelProcess = await this.startTunnel(tunnelName, localPort);

            // 等待隧道URL生成
            const tunnelUrl = await this.waitForTunnelUrl(tunnelProcess, instanceId);

            const tunnelInfo = {
                id: tunnelName,
                instanceId,
                localPort,
                url: tunnelUrl,
                process: tunnelProcess,
                createdAt: new Date().toISOString()
            };

            this.tunnels.set(tunnelName, tunnelInfo);

            // 等待隧道完全就绪（添加延迟和健康检查）
            await this.waitForTunnelReady(tunnelUrl, localPort);

            return {
                id: tunnelName,
                url: tunnelUrl
            };

        } catch (error) {
            throw new Error(`创建Cloudflare隧道失败: ${error.message}`);
        }
    }

    // 检查cloudflared是否可用
    async checkCloudflaredAvailable() {
        return new Promise((resolve, reject) => {
            const process = spawn(this.cloudflaredPath, ['--version']);
            
            process.on('close', (code) => {
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error('cloudflared 不可用，请确保已安装 cloudflared'));
                }
            });
            
            process.on('error', (error) => {
                reject(new Error(`cloudflared 执行失败: ${error.message}`));
            });
        });
    }

    // 启动隧道进程
    async startTunnel(tunnelName, localPort) {
        return new Promise((resolve, reject) => {
            // 如果是首页，使用machine-manager隧道，否则使用quick隧道
            let args;
            if (tunnelName === 'machine-manager') {
                // 对于首页，使用quick隧道（临时方案）
                args = [
                    'tunnel',
                    '--url', `http://localhost:${localPort}`,
                    '--no-autoupdate',
                    '--logfile', '/dev/null'
                ];
            } else {
                // 对于实例，使用quick隧道
                args = [
                    'tunnel',
                    '--url', `http://localhost:${localPort}`,
                    '--no-autoupdate',
                    '--logfile', '/dev/null'
                ];
            }

            const tunnelProcess = spawn(this.cloudflaredPath, args, {
                stdio: ['ignore', 'pipe', 'pipe']
            });

            let urlFound = false;
            let errorOutput = '';
            let stdOutput = '';

            // 监听标准输出（静默模式，只查找URL）
            tunnelProcess.stdout.on('data', (data) => {
                const output = data.toString();
                stdOutput += output;

                // 在标准输出中也检查URL
                const urlMatch = output.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
                if (urlMatch && !urlFound) {
                    urlFound = true;
                    tunnelProcess.tunnelUrl = urlMatch[0];
                    console.log(`✅ 隧道创建成功: ${urlMatch[0]}`);
                    resolve(tunnelProcess);
                }
            });

            // 监听错误输出（静默模式，只查找URL和关键错误）
            tunnelProcess.stderr.on('data', (data) => {
                const output = data.toString();
                errorOutput += output;

                // 检查是否有隧道URL（cloudflared通常在stderr输出URL）
                const urlMatch = output.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
                if (urlMatch && !urlFound) {
                    urlFound = true;
                    tunnelProcess.tunnelUrl = urlMatch[0];
                    console.log(`✅ 隧道创建成功: ${urlMatch[0]}`);
                    resolve(tunnelProcess);
                }

                // 只输出关键错误信息
                if (output.includes('failed to connect to the edge') ||
                    output.includes('authentication required') ||
                    output.includes('login required') ||
                    output.includes('error=') ||
                    output.includes('ERR ')) {

                    // 只在真正的错误时输出日志
                    if (output.includes('failed to connect to the edge') ||
                        output.includes('authentication required') ||
                        output.includes('login required')) {
                        console.log(`❌ 隧道错误: ${output.trim()}`);
                        if (!urlFound) {
                            tunnelProcess.kill();
                            reject(new Error(`Cloudflare隧道认证失败: ${output.trim()}`));
                        }
                    }
                }
            });

            // 监听进程退出
            tunnelProcess.on('close', (code) => {
                if (!urlFound) {
                    reject(new Error(`隧道进程退出，代码: ${code}, 标准输出: ${stdOutput}, 错误输出: ${errorOutput}`));
                }
            });

            // 监听进程错误
            tunnelProcess.on('error', (error) => {
                reject(new Error(`启动隧道进程失败: ${error.message}`));
            });

            // 设置超时
            setTimeout(() => {
                if (!urlFound) {
                    tunnelProcess.kill();
                    reject(new Error('等待隧道URL超时（30秒）'));
                }
            }, 30000); // 30秒超时
        });
    }

    // 等待隧道URL生成
    async waitForTunnelUrl(tunnelProcess, instanceId, maxWaitTime = 30000) {
        const startTime = Date.now();
        
        while (Date.now() - startTime < maxWaitTime) {
            if (tunnelProcess.tunnelUrl) {
                return tunnelProcess.tunnelUrl;
            }
            
            await this.sleep(1000); // 等待1秒
        }
        
        throw new Error('等待隧道URL超时');
    }

    // 关闭隧道
    async closeTunnel(tunnelId) {
        const tunnel = this.tunnels.get(tunnelId);
        if (!tunnel) {
            console.log(`隧道 ${tunnelId} 不存在，跳过关闭`);
            return;
        }
        
        try {
            console.log(`正在关闭隧道 ${tunnelId}`);
            
            // 终止隧道进程
            if (tunnel.process && !tunnel.process.killed) {
                tunnel.process.kill('SIGTERM');
                
                // 等待进程退出
                await new Promise((resolve) => {
                    tunnel.process.on('close', resolve);
                    
                    // 如果5秒后还没退出，强制杀死
                    setTimeout(() => {
                        if (!tunnel.process.killed) {
                            tunnel.process.kill('SIGKILL');
                        }
                        resolve();
                    }, 5000);
                });
            }
            
            // 从记录中删除
            this.tunnels.delete(tunnelId);
            
            console.log(`隧道 ${tunnelId} 已关闭`);
            
        } catch (error) {
            console.error(`关闭隧道 ${tunnelId} 时出错:`, error);
        }
    }

    // 获取隧道状态
    getTunnelStatus(tunnelId) {
        const tunnel = this.tunnels.get(tunnelId);
        if (!tunnel) {
            return null;
        }
        
        return {
            id: tunnel.id,
            instanceId: tunnel.instanceId,
            url: tunnel.url,
            localPort: tunnel.localPort,
            running: tunnel.process && !tunnel.process.killed,
            createdAt: tunnel.createdAt
        };
    }

    // 清理所有隧道
    async cleanupAllTunnels() {
        console.log(`正在清理 ${this.tunnels.size} 个隧道`);
        
        const closePromises = [];
        for (const [tunnelId] of this.tunnels) {
            closePromises.push(this.closeTunnel(tunnelId));
        }
        
        await Promise.all(closePromises);
        console.log('所有隧道已清理');
    }

    // 检查隧道是否可访问
    async checkTunnelHealth(tunnelUrl) {
        try {
            const response = await axios.get(tunnelUrl, {
                timeout: 10000,
                validateStatus: () => true // 接受所有状态码
            });
            
            return {
                accessible: true,
                statusCode: response.status,
                responseTime: response.headers['x-response-time'] || 'unknown'
            };
            
        } catch (error) {
            return {
                accessible: false,
                error: error.message
            };
        }
    }

    // 等待隧道完全就绪
    async waitForTunnelReady(tunnelUrl, localPort, maxWaitTime = 60000) {
        console.log(`等待隧道 ${tunnelUrl} 完全就绪...`);
        const startTime = Date.now();
        let attempts = 0;

        while (Date.now() - startTime < maxWaitTime) {
            attempts++;

            try {
                // 首先检查本地端口是否可访问
                const localResponse = await axios.get(`http://localhost:${localPort}`, {
                    timeout: 5000,
                    validateStatus: () => true
                });

                if (localResponse.status === 200) {
                    // 本地端口正常，再检查隧道
                    const tunnelResponse = await axios.get(tunnelUrl, {
                        timeout: 10000,
                        validateStatus: () => true
                    });

                    if (tunnelResponse.status === 200) {
                        console.log(`✅ 隧道 ${tunnelUrl} 已就绪 (尝试 ${attempts} 次)`);
                        return true;
                    } else {
                        console.log(`隧道返回状态码 ${tunnelResponse.status}，继续等待...`);
                    }
                } else {
                    console.log(`本地端口 ${localPort} 返回状态码 ${localResponse.status}，继续等待...`);
                }

            } catch (error) {
                console.log(`隧道健康检查失败 (尝试 ${attempts}): ${error.message}`);
            }

            // 等待2秒后重试
            await this.sleep(2000);
        }

        console.log(`⚠️ 隧道 ${tunnelUrl} 健康检查超时，但继续使用`);
        return false;
    }

    // 工具方法：睡眠
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = TunnelManager;
