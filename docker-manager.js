const Docker = require('dockerode');
const path = require('path');

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

    // 创建容器（支持不同界面类型）
    async createContainer(instanceId, instanceType = '24v64g', interfaceType = 'vnc') {
        if (interfaceType === 'vnc') {
            return this.createVNCContainer(instanceId, instanceType);
        } else if (interfaceType === 'terminal') {
            return this.createTerminalContainer(instanceId, instanceType);
        } else {
            throw new Error(`不支持的界面类型: ${interfaceType}`);
        }
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

            // 获取伪造配置并创建伪造文件
            const fakeConfig = this.getFakeSystemConfig(instanceType);
            await this.createFakeSystemFiles(instanceId, instanceType);

            // 创建容器
            const container = await this.docker.createContainer({
                Image: 'dorowu/ubuntu-desktop-lxde-vnc:latest',
                name: `vnc-instance-${instanceId}`,
                Env: [
                    'RESOLUTION=1440x900',
                    'USER=ubuntu',
                    // 传递伪造的硬件信息
                    `FAKE_CPU=Intel Xeon Gold 6248`,
                    `FAKE_CPU_CORES=${fakeConfig.cpuCores}`,
                    `FAKE_MEM=${fakeConfig.memTotal * 1024}`, // 转换为字节
                    `FAKE_MEM_FREE=${fakeConfig.memFree * 1024}`,
                    `FAKE_MEM_AVAILABLE=${fakeConfig.memAvailable * 1024}`,
                    `FAKE_SWAP=${fakeConfig.swapTotal * 1024}`,
                    `FAKE_DISK_SIZE=${fakeConfig.diskSectors}`,
                    `INSTANCE_TYPE=${instanceType}`
                ],
                Entrypoint: ['/vnc-fakeproc-entrypoint.sh'],
                Cmd: ['/startup.sh'],  // VNC启动脚本
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
                    },
                    // 使用最小特权方案实现硬件伪造
                    CapAdd: ['SYS_ADMIN'],
                    Privileged: false,  // 保持非特权
                    Devices: [
                        { PathOnHost: '/dev/fuse', PathInContainer: '/dev/fuse', CgroupPermissions: 'rwm' }
                    ],
                    SecurityOpt: [
                        'seccomp=unconfined',
                        'no-new-privileges'
                    ],
                    Binds: [
                        `${path.resolve(__dirname, 'vnc-fakeproc-entrypoint.sh')}:/vnc-fakeproc-entrypoint.sh:ro`
                    ]
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

            // 硬件伪造由入口脚本处理

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

    // 创建Terminal容器（基于ttyd的Web终端）
    async createTerminalContainer(instanceId, instanceType = '24v64g') {
        const port = this.getAvailablePort();

        // 根据实例类型设置资源限制
        const resourceConfig = this.getResourceConfig(instanceType);

        try {
            // 使用Ubuntu镜像（包含Python3）
            await this.pullImage('ubuntu:20.04');

            // 创建容器
            const container = await this.docker.createContainer({
                Image: 'ubuntu:20.04',
                name: `terminal-instance-${instanceId}`,
                Entrypoint: ['/fakeproc-entrypoint.sh'],
                Cmd: [],
                Env: [
                    `INSTANCE_TYPE=${instanceType}`,
                    'TERM=xterm-256color'
                ],
                ExposedPorts: {
                    '7681/tcp': {}
                },
                HostConfig: {
                    PortBindings: {
                        '7681/tcp': [{ HostPort: port.toString() }]
                    },
                    Memory: resourceConfig.memory,
                    CpuShares: resourceConfig.cpuShares,
                    RestartPolicy: {
                        Name: 'unless-stopped'
                    },
                    // 使用最小特权方案实现硬件伪造
                    CapAdd: ['SYS_ADMIN'],
                    Privileged: false,  // 保持非特权
                    Devices: [
                        {
                            PathOnHost: '/dev/fuse',
                            PathInContainer: '/dev/fuse',
                            CgroupPermissions: 'rwm'
                        }
                    ],
                    SecurityOpt: [
                        'seccomp=unconfined',
                        'no-new-privileges'
                    ],
                    Binds: [
                        `${path.resolve(__dirname, 'fakeproc-entrypoint.sh')}:/fakeproc-entrypoint.sh:ro`,
                        `${path.resolve(__dirname, 'fakeprocfs.py')}:/fakeprocfs.py:ro`,
                        `${path.resolve(__dirname, 'create-fake-proc.py')}:/create-fake-proc.py:ro`,
                        `${path.resolve(__dirname, 'specgen.sh')}:/specgen:ro`,
                        `${path.resolve(__dirname, 'terminal-startup.sh')}:/startup.sh:ro`
                    ]
                },
                Labels: {
                    'terminal-instance': 'true',
                    'instance-id': instanceId,
                    'instance-type': instanceType,
                    'created-at': new Date().toISOString()
                }
            });

            // 启动容器
            await container.start();

            console.log(`Terminal容器 ${instanceId} (${instanceType}) 创建并启动成功`);

            return {
                id: container.id,
                port: port,
                name: `terminal-instance-${instanceId}`,
                instanceType: instanceType
            };

        } catch (error) {
            // 如果创建失败，释放端口
            this.releasePort(port);
            throw new Error(`创建Terminal容器失败: ${error.message}`);
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

            // 清理伪造的系统文件
            await this.cleanupFakeSystemFiles(containerId);

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

    // 检查容器是否在运行
    async isContainerRunning(containerId) {
        try {
            const container = this.docker.getContainer(containerId);
            const inspect = await container.inspect();
            return inspect.State.Running;
        } catch (error) {
            return false;
        }
    }

    // 创建伪造的系统信息文件
    async createFakeSystemFiles(instanceId, instanceType) {
        const fs = require('fs').promises;
        const path = require('path');

        const fakeDir = `/tmp/fake-proc-${instanceId}`;

        try {
            // 创建目录
            await fs.mkdir(fakeDir, { recursive: true });

            // 根据实例类型获取伪造的配置
            const fakeConfig = this.getFakeSystemConfig(instanceType);

            // 创建伪造的 /proc/meminfo
            const meminfo = `MemTotal:       ${fakeConfig.memTotal} kB
MemFree:        ${fakeConfig.memFree} kB
MemAvailable:   ${fakeConfig.memAvailable} kB
Buffers:        ${fakeConfig.buffers} kB
Cached:         ${fakeConfig.cached} kB
SwapCached:     0 kB
Active:         ${Math.floor(fakeConfig.memTotal * 0.3)} kB
Inactive:       ${Math.floor(fakeConfig.memTotal * 0.2)} kB
SwapTotal:      ${fakeConfig.swapTotal} kB
SwapFree:       ${fakeConfig.swapTotal} kB`;

            await fs.writeFile(path.join(fakeDir, 'meminfo'), meminfo);

            // 创建伪造的 /proc/cpuinfo
            let cpuinfo = '';
            for (let i = 0; i < fakeConfig.cpuCores; i++) {
                cpuinfo += `processor\t: ${i}
vendor_id\t: GenuineIntel
cpu family\t: 6
model\t\t: 85
model name\t: Intel(R) Xeon(R) Gold 6248 CPU @ 2.50GHz
stepping\t: 7
microcode\t: 0x5003006
cpu MHz\t\t: 2500.000
cache size\t: 27648 KB
physical id\t: 0
siblings\t: ${fakeConfig.cpuCores}
core id\t\t: ${i}
cpu cores\t: ${fakeConfig.cpuCores}
apicid\t\t: ${i}
initial apicid\t: ${i}
fpu\t\t: yes
fpu_exception\t: yes
cpuid level\t: 22
wp\t\t: yes
flags\t\t: fpu vme de pse tsc msr pae mce cx8 apic sep mtrr pge mca cmov pat pse36 clflush dts acpi mmx fxsr sse sse2 ss ht tm pbe syscall nx pdpe1gb rdtscp lm constant_tsc art arch_perfmon pebs bts rep_good nopl xtopology nonstop_tsc cpuid aperfmperf pni pclmulqdq dtes64 monitor ds_cpl vmx smx est tm2 ssse3 sdbg fma cx16 xtpr pdcm pcid dca sse4_1 sse4_2 x2apic movbe popcnt tsc_deadline_timer aes xsave avx f16c rdrand lahf_lm abm 3dnowprefetch cpuid_fault epb cat_l3 cdp_l3 invpcid_single intel_ppin ssbd mba ibrs ibpb stibp ibrs_enhanced tpr_shadow vnmi flexpriority ept vpid ept_ad fsgsbase tsc_adjust bmi1 hle avx2 smep bmi2 erms invpcid rtm cqm mpx rdt_a avx512f avx512dq rdseed adx smap clflushopt clwb intel_pt avx512cd avx512bw avx512vl xsaveopt xsavec xgetbv1 xsaves cqm_llc cqm_occup_llc cqm_mbm_total cqm_mbm_local dtherm ida arat pln pts pku ospke avx512_vnni md_clear flush_l1d arch_capabilities
bugs\t\t: spectre_v1 spectre_v2 spec_store_bypass swapgs taa itlb_multihit srbds mmio_stale_data retbleed
bogomips\t: 5000.00
clflush size\t: 64
cache_alignment\t: 64
address sizes\t: 46 bits physical, 48 bits virtual
power management:

`;
            }

            await fs.writeFile(path.join(fakeDir, 'cpuinfo'), cpuinfo);

            // 创建伪造的 /proc/stat
            const stat = `cpu  123456 0 234567 ${fakeConfig.cpuIdle} 0 0 0 0 0 0
cpu0 30864 0 58641 ${Math.floor(fakeConfig.cpuIdle / fakeConfig.cpuCores)} 0 0 0 0 0 0
${Array.from({length: fakeConfig.cpuCores - 1}, (_, i) =>
    `cpu${i+1} 30864 0 58641 ${Math.floor(fakeConfig.cpuIdle / fakeConfig.cpuCores)} 0 0 0 0 0 0`
).join('\n')}
intr 12345678 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0
ctxt 87654321
btime 1640995200
processes 12345
procs_running 1
procs_blocked 0
softirq 1234567 0 123456 0 0 0 0 0 0 0 0`;

            await fs.writeFile(path.join(fakeDir, 'stat'), stat);

            // 创建伪造的 /proc/version
            const version = `Linux version 5.15.0-generic (buildd@ubuntu) (gcc (Ubuntu 11.2.0-19ubuntu1) 11.2.0, GNU ld (GNU Binutils for Ubuntu) 2.38) #72-Ubuntu SMP Fri Feb 11 17:17:17 UTC 2022`;

            await fs.writeFile(path.join(fakeDir, 'version'), version);

            // 创建伪造的 /proc/diskstats
            const diskstats = `   8       0 sda ${fakeConfig.diskReads} 0 ${fakeConfig.diskSectors} 0 ${fakeConfig.diskWrites} 0 ${fakeConfig.diskSectors} 0 0 0 0 0 0 0 0 0
   8       1 sda1 ${Math.floor(fakeConfig.diskReads * 0.9)} 0 ${Math.floor(fakeConfig.diskSectors * 0.9)} 0 ${Math.floor(fakeConfig.diskWrites * 0.9)} 0 ${Math.floor(fakeConfig.diskSectors * 0.9)} 0 0 0 0 0 0 0 0 0`;

            await fs.writeFile(path.join(fakeDir, 'diskstats'), diskstats);

            console.log(`为实例 ${instanceId} 创建了伪造的系统信息文件 (${instanceType})`);

        } catch (error) {
            console.error(`创建伪造系统文件失败:`, error);
            throw error;
        }
    }

    // 生成CPU集合字符串，用于限制容器可使用的CPU核心
    generateCpusetCpus(cpuCores) {
        // 获取宿主机可用的CPU核心数
        const os = require('os');
        const hostCpuCores = os.cpus().length;

        // 如果请求的核心数超过宿主机核心数，使用宿主机的所有核心
        const actualCpuCores = Math.min(cpuCores, hostCpuCores);

        // 生成 "0-N" 格式的CPU集合，例如 "0-3" 表示使用CPU 0,1,2,3
        return `0-${actualCpuCores - 1}`;
    }

    // 获取伪造的系统配置
    getFakeSystemConfig(instanceType) {
        const configs = {
            '2v2g': {
                memTotal: 2 * 1024 * 1024,      // 2GB in KB
                memFree: Math.floor(2 * 1024 * 1024 * 0.6),
                memAvailable: Math.floor(2 * 1024 * 1024 * 0.7),
                buffers: Math.floor(2 * 1024 * 1024 * 0.05),
                cached: Math.floor(2 * 1024 * 1024 * 0.15),
                swapTotal: 1 * 1024 * 1024,     // 1GB swap
                cpuCores: 2,
                cpuIdle: 9000000,
                diskReads: 890123,
                diskWrites: 567890,
                diskSectors: 65536000           // 64GB 磁盘
            },
            '4v4g': {
                memTotal: 4 * 1024 * 1024,      // 4GB in KB
                memFree: Math.floor(4 * 1024 * 1024 * 0.6),
                memAvailable: Math.floor(4 * 1024 * 1024 * 0.7),
                buffers: Math.floor(4 * 1024 * 1024 * 0.05),
                cached: Math.floor(4 * 1024 * 1024 * 0.15),
                swapTotal: 2 * 1024 * 1024,     // 2GB swap
                cpuCores: 4,
                cpuIdle: 18000000,
                diskReads: 890123,
                diskWrites: 567890,
                diskSectors: 65536000           // 64GB 磁盘
            },
            '16v16g': {
                memTotal: 16 * 1024 * 1024,     // 16GB in KB
                memFree: Math.floor(16 * 1024 * 1024 * 0.6),
                memAvailable: Math.floor(16 * 1024 * 1024 * 0.7),
                buffers: Math.floor(16 * 1024 * 1024 * 0.05),
                cached: Math.floor(16 * 1024 * 1024 * 0.15),
                swapTotal: 8 * 1024 * 1024,     // 8GB swap
                cpuCores: 16,
                cpuIdle: 72000000,
                diskReads: 890123,
                diskWrites: 567890,
                diskSectors: 65536000           // 64GB 磁盘
            },
            '24v64g': {
                memTotal: 64 * 1024 * 1024,     // 64GB in KB
                memFree: Math.floor(64 * 1024 * 1024 * 0.6),
                memAvailable: Math.floor(64 * 1024 * 1024 * 0.7),
                buffers: Math.floor(64 * 1024 * 1024 * 0.05),
                cached: Math.floor(64 * 1024 * 1024 * 0.15),
                swapTotal: 32 * 1024 * 1024,    // 32GB swap
                cpuCores: 24,
                cpuIdle: 108000000,
                diskReads: 890123,
                diskWrites: 567890,
                diskSectors: 65536000           // 64GB 磁盘
            }
        };

        return configs[instanceType] || configs['24v64g'];
    }

    // 清理伪造的系统文件
    async cleanupFakeSystemFiles(containerId) {
        const fs = require('fs').promises;
        const path = require('path');

        try {
            // 从容器ID中提取实例ID
            const container = this.docker.getContainer(containerId);
            const inspect = await container.inspect();
            const instanceId = inspect.Config.Labels['instance-id'];

            if (instanceId) {
                const fakeDir = `/tmp/fake-proc-${instanceId}`;

                try {
                    await fs.rm(fakeDir, { recursive: true, force: true });
                    console.log(`已清理实例 ${instanceId} 的伪造系统文件`);
                } catch (error) {
                    console.log(`清理伪造系统文件时出错 (可能已不存在): ${error.message}`);
                }
            }
        } catch (error) {
            console.log(`获取容器信息失败，跳过清理伪造文件: ${error.message}`);
        }
    }

    // 生成Sysbox伪造的/proc文件
    async generateSysboxFakeProcFiles(containerId, instanceType) {
        const { exec } = require('child_process');
        const util = require('util');
        const execAsync = util.promisify(exec);

        try {
            console.log(`正在为容器 ${containerId} 生成伪造的硬件信息 (${instanceType})`);

            // 调用生成脚本
            const command = `sudo ./gen_fake_proc.sh ${containerId} ${instanceType}`;
            const { stdout, stderr } = await execAsync(command);

            if (stderr) {
                console.warn(`生成伪造文件警告: ${stderr}`);
            }

            console.log(`伪造硬件信息生成成功: ${stdout.trim()}`);

        } catch (error) {
            console.error(`生成伪造硬件信息失败: ${error.message}`);
            // 不抛出错误，让容器继续运行
        }
    }

    // 工具方法：睡眠
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = DockerManager;
