const Docker = require('dockerode');

class DockerManager {
    constructor() {
        this.docker = new Docker();
        this.usedPorts = new Set();
        this.basePort = 6080; // VNC Web端口起始

        // 初始化时检查现有容器的端口使用情况
        this.initializePortUsage();
    }

    // 初始化端口使用情况 - 清理所有现有容器
    async initializePortUsage() {
        try {
            const containers = await this.docker.listContainers({
                all: true,
                filters: {
                    label: ['vnc-instance=true']
                }
            });

            if (containers.length > 0) {
                console.log(`发现 ${containers.length} 个现有VNC容器，正在清理...`);

                for (const containerInfo of containers) {
                    try {
                        const container = this.docker.getContainer(containerInfo.Id);

                        // 停止容器
                        if (containerInfo.State === 'running') {
                            console.log(`停止容器: ${containerInfo.Names[0]}`);
                            await container.stop({ t: 5 });
                        }

                        // 删除容器
                        console.log(`删除容器: ${containerInfo.Names[0]}`);
                        await container.remove({ force: true });

                    } catch (error) {
                        console.error(`清理容器 ${containerInfo.Id} 时出错:`, error.message);
                    }
                }

                console.log('所有现有VNC容器已清理完成');
            } else {
                console.log('未发现现有VNC容器');
            }

            // 清空端口使用记录
            this.usedPorts.clear();
            console.log('端口使用记录已重置');

        } catch (error) {
            console.error('初始化端口使用记录时出错:', error);
        }
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
    async createVNCContainer(instanceId, instanceType = '24v64g') {
        const port = this.getAvailablePort();
        const vncPort = port + 1000; // VNC客户端端口

        // 根据实例类型设置资源限制（表面上不同，实际相同）
        const resourceConfig = this.getResourceConfig(instanceType);

        try {
            console.log(`正在创建容器 ${instanceId} (${instanceType})，端口映射: ${port}:80, ${vncPort}:5900`);

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
                    Memory: resourceConfig.memory,
                    CpuShares: resourceConfig.cpuShares,
                    RestartPolicy: {
                        Name: 'unless-stopped'
                    }
                },
                Labels: {
                    'vnc-instance': 'true',
                    'instance-id': instanceId,
                    'instance-type': instanceType,
                    'created-at': new Date().toISOString()
                }
            });

            // 启动容器
            await container.start();

            console.log(`容器 ${instanceId} (${instanceType}) 创建并启动成功`);

            return {
                id: container.id,
                port: port,
                vncPort: vncPort,
                name: `vnc-instance-${instanceId}`,
                instanceType: instanceType
            };

        } catch (error) {
            // 如果创建失败，释放端口
            this.releasePort(port);
            throw new Error(`创建容器失败: ${error.message}`);
        }
    }

    // 获取资源配置（实际上都是相同的配置）
    getResourceConfig(instanceType) {
        // 虽然显示不同的配置，但实际使用相同的资源
        const configs = {
            '2v2g': {
                memory: 2 * 1024 * 1024 * 1024, // 2GB
                cpuShares: 1024
            },
            '4v4g': {
                memory: 2 * 1024 * 1024 * 1024, // 实际还是2GB
                cpuShares: 1024
            },
            '16v16g': {
                memory: 2 * 1024 * 1024 * 1024, // 实际还是2GB
                cpuShares: 1024
            },
            '24v64g': {
                memory: 2 * 1024 * 1024 * 1024, // 实际还是2GB
                cpuShares: 1024
            }
        };

        return configs[instanceType] || configs['24v64g'];
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
            if (ports['80/tcp'] && ports['80/tcp'][0]) {
                const port = parseInt(ports['80/tcp'][0].HostPort);
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
