const Docker = require('dockerode');

class DockerManager {
    constructor() {
        this.docker = new Docker();
        this.usedPorts = new Set();
        this.basePort = 6080; // VNC Web端口起始
    }

    // 获取可用端口
    getAvailablePort() {
        let port = this.basePort;
        while (this.usedPorts.has(port)) {
            port++;
        }
        this.usedPorts.add(port);
        return port;
    }

    // 释放端口
    releasePort(port) {
        this.usedPorts.delete(port);
    }

    // 创建VNC容器
    async createVNCContainer(instanceId) {
        const port = this.getAvailablePort();
        const vncPort = port + 1000; // VNC客户端端口
        
        try {
            console.log(`正在创建容器 ${instanceId}，端口映射: ${port}:6080, ${vncPort}:5900`);
            
            // 首先拉取镜像
            await this.pullImage('dorowu/ubuntu-desktop-lxde-vnc:latest');
            
            // 创建容器
            const container = await this.docker.createContainer({
                Image: 'dorowu/ubuntu-desktop-lxde-vnc:latest',
                name: `vnc-instance-${instanceId}`,
                Env: [
                    'RESOLUTION=1024x768',
                    'USER=ubuntu'
                ],
                ExposedPorts: {
                    '80/tcp': {},
                    '5900/tcp': {}
                },
                HostConfig: {
                    PortBindings: {
                        '80/tcp': [{ HostPort: port.toString() }],
                        '5900/tcp': [{ HostPort: vncPort.toString() }]
                    },
                    Memory: 2 * 1024 * 1024 * 1024, // 2GB内存限制
                    CpuShares: 1024, // CPU权重
                    RestartPolicy: {
                        Name: 'unless-stopped'
                    }
                },
                Labels: {
                    'vnc-instance': 'true',
                    'instance-id': instanceId,
                    'created-at': new Date().toISOString()
                }
            });

            // 启动容器
            await container.start();
            
            console.log(`容器 ${instanceId} 创建并启动成功`);
            
            return {
                id: container.id,
                port: port,
                vncPort: vncPort,
                name: `vnc-instance-${instanceId}`
            };
            
        } catch (error) {
            // 如果创建失败，释放端口
            this.releasePort(port);
            throw new Error(`创建容器失败: ${error.message}`);
        }
    }

    // 拉取Docker镜像
    async pullImage(imageName) {
        return new Promise((resolve, reject) => {
            console.log(`正在拉取镜像: ${imageName}`);
            
            this.docker.pull(imageName, (err, stream) => {
                if (err) {
                    reject(err);
                    return;
                }

                this.docker.modem.followProgress(stream, (err, res) => {
                    if (err) {
                        reject(err);
                    } else {
                        console.log(`镜像 ${imageName} 拉取完成`);
                        resolve(res);
                    }
                }, (event) => {
                    // 显示拉取进度
                    if (event.status && event.progress) {
                        console.log(`${event.status}: ${event.progress}`);
                    }
                });
            });
        });
    }

    // 等待容器完全启动
    async waitForContainer(containerId, maxWaitTime = 60000) {
        const container = this.docker.getContainer(containerId);
        const startTime = Date.now();
        
        while (Date.now() - startTime < maxWaitTime) {
            try {
                const info = await container.inspect();
                
                if (info.State.Running) {
                    // 额外等待VNC服务启动
                    await this.sleep(10000); // 等待10秒
                    console.log(`容器 ${containerId} 已就绪`);
                    return true;
                }
                
                if (info.State.Status === 'exited') {
                    throw new Error(`容器启动失败，退出状态: ${info.State.ExitCode}`);
                }
                
                await this.sleep(2000); // 等待2秒后重试
                
            } catch (error) {
                if (error.statusCode === 404) {
                    throw new Error('容器不存在');
                }
                throw error;
            }
        }
        
        throw new Error('容器启动超时');
    }

    // 删除容器
    async removeContainer(containerId) {
        try {
            const container = this.docker.getContainer(containerId);
            const info = await container.inspect();
            
            // 获取端口信息以便释放
            const ports = info.NetworkSettings.Ports;
            if (ports['6080/tcp'] && ports['6080/tcp'][0]) {
                const port = parseInt(ports['6080/tcp'][0].HostPort);
                this.releasePort(port);
            }
            
            // 停止容器
            if (info.State.Running) {
                console.log(`正在停止容器 ${containerId}`);
                await container.stop({ t: 10 }); // 10秒优雅停止
            }
            
            // 删除容器
            console.log(`正在删除容器 ${containerId}`);
            await container.remove({ force: true });
            
            console.log(`容器 ${containerId} 已删除`);
            
        } catch (error) {
            if (error.statusCode === 404) {
                console.log(`容器 ${containerId} 不存在，跳过删除`);
                return;
            }
            throw new Error(`删除容器失败: ${error.message}`);
        }
    }

    // 获取容器状态
    async getContainerStatus(containerId) {
        try {
            const container = this.docker.getContainer(containerId);
            const info = await container.inspect();
            
            return {
                id: info.Id,
                name: info.Name,
                state: info.State.Status,
                running: info.State.Running,
                startedAt: info.State.StartedAt,
                ports: info.NetworkSettings.Ports
            };
            
        } catch (error) {
            if (error.statusCode === 404) {
                return null;
            }
            throw error;
        }
    }

    // 清理所有VNC实例容器
    async cleanupAllInstances() {
        try {
            const containers = await this.docker.listContainers({
                all: true,
                filters: {
                    label: ['vnc-instance=true']
                }
            });
            
            console.log(`发现 ${containers.length} 个VNC实例容器`);
            
            for (const containerInfo of containers) {
                await this.removeContainer(containerInfo.Id);
            }
            
            // 清空端口使用记录
            this.usedPorts.clear();
            
        } catch (error) {
            console.error('清理容器时出错:', error);
        }
    }

    // 工具方法：睡眠
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = DockerManager;
