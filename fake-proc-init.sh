#!/bin/bash

# 伪造系统信息初始化脚本
# 根据环境变量生成伪造的 /proc 文件

echo "开始初始化伪造的系统信息..."

# 检查必要的环境变量
if [ -z "$FAKE_CPU_CORES" ] || [ -z "$FAKE_MEM" ]; then
    echo "警告: 未找到伪造配置环境变量，使用默认值"
    FAKE_CPU_CORES=${FAKE_CPU_CORES:-2}
    FAKE_MEM=${FAKE_MEM:-2147483648}
    FAKE_MEM_FREE=${FAKE_MEM_FREE:-1288490188}
    FAKE_MEM_AVAILABLE=${FAKE_MEM_AVAILABLE:-1503238553}
    FAKE_SWAP=${FAKE_SWAP:-1073741824}
    FAKE_DISK_SIZE=${FAKE_DISK_SIZE:-65536000}
    FAKE_CPU=${FAKE_CPU:-"Intel Xeon Gold 6248"}
    INSTANCE_TYPE=${INSTANCE_TYPE:-"2v2g"}
fi

echo "配置信息: $INSTANCE_TYPE - CPU:${FAKE_CPU_CORES}核 内存:$((FAKE_MEM/1024/1024/1024))GB"

# 创建临时目录存放伪造文件
mkdir -p /tmp/fake-proc

# 生成伪造的 /proc/meminfo
cat > /tmp/fake-proc/meminfo << EOF
MemTotal:       $((FAKE_MEM/1024)) kB
MemFree:        $((FAKE_MEM_FREE/1024)) kB
MemAvailable:   $((FAKE_MEM_AVAILABLE/1024)) kB
Buffers:        $((FAKE_MEM/1024/20)) kB
Cached:         $((FAKE_MEM/1024/7)) kB
SwapCached:     0 kB
Active:         $((FAKE_MEM/1024/3)) kB
Inactive:       $((FAKE_MEM/1024/5)) kB
SwapTotal:      $((FAKE_SWAP/1024)) kB
SwapFree:       $((FAKE_SWAP/1024)) kB
Dirty:          0 kB
Writeback:      0 kB
AnonPages:      $((FAKE_MEM/1024/4)) kB
Mapped:         $((FAKE_MEM/1024/10)) kB
Shmem:          $((FAKE_MEM/1024/20)) kB
KReclaimable:   $((FAKE_MEM/1024/15)) kB
Slab:           $((FAKE_MEM/1024/12)) kB
SReclaimable:   $((FAKE_MEM/1024/15)) kB
SUnreclaim:     $((FAKE_MEM/1024/25)) kB
KernelStack:    $((FAKE_MEM/1024/100)) kB
PageTables:     $((FAKE_MEM/1024/50)) kB
NFS_Unstable:   0 kB
Bounce:         0 kB
WritebackTmp:   0 kB
CommitLimit:    $((FAKE_MEM/1024 + FAKE_SWAP/1024/2)) kB
Committed_AS:   $((FAKE_MEM/1024/2)) kB
VmallocTotal:   34359738367 kB
VmallocUsed:    0 kB
VmallocChunk:   0 kB
Percpu:         2048 kB
HardwareCorrupted: 0 kB
AnonHugePages:  0 kB
ShmemHugePages: 0 kB
ShmemPmdMapped: 0 kB
FileHugePages:  0 kB
FilePmdMapped:  0 kB
HugePages_Total: 0
HugePages_Free:  0
HugePages_Rsvd:  0
HugePages_Surp:  0
Hugepagesize:    2048 kB
Hugetlb:         0 kB
DirectMap4k:     $((FAKE_MEM/1024/4)) kB
DirectMap2M:     $((FAKE_MEM/1024*3/4)) kB
DirectMap1G:     0 kB
EOF

# 生成伪造的 /proc/cpuinfo
cat > /tmp/fake-proc/cpuinfo << EOF
EOF

for ((i=0; i<FAKE_CPU_CORES; i++)); do
cat >> /tmp/fake-proc/cpuinfo << EOF
processor	: $i
vendor_id	: GenuineIntel
cpu family	: 6
model		: 85
model name	: $FAKE_CPU @ 2.50GHz
stepping	: 7
microcode	: 0x5003006
cpu MHz		: 2500.000
cache size	: 27648 KB
physical id	: 0
siblings	: $FAKE_CPU_CORES
core id		: $i
cpu cores	: $FAKE_CPU_CORES
apicid		: $i
initial apicid	: $i
fpu		: yes
fpu_exception	: yes
cpuid level	: 22
wp		: yes
flags		: fpu vme de pse tsc msr pae mce cx8 apic sep mtrr pge mca cmov pat pse36 clflush dts acpi mmx fxsr sse sse2 ss ht tm pbe syscall nx pdpe1gb rdtscp lm constant_tsc art arch_perfmon pebs bts rep_good nopl xtopology nonstop_tsc cpuid aperfmperf pni pclmulqdq dtes64 monitor ds_cpl vmx smx est tm2 ssse3 sdbg fma cx16 xtpr pdcm pcid dca sse4_1 sse4_2 x2apic movbe popcnt tsc_deadline_timer aes xsave avx f16c rdrand lahf_lm abm 3dnowprefetch cpuid_fault epb cat_l3 cdp_l3 invpcid_single intel_ppin ssbd mba ibrs ibpb stibp ibrs_enhanced tpr_shadow vnmi flexpriority ept vpid ept_ad fsgsbase tsc_adjust bmi1 hle avx2 smep bmi2 erms invpcid rtm cqm mpx rdt_a avx512f avx512dq rdseed adx smap clflushopt clwb intel_pt avx512cd avx512bw avx512vl xsaveopt xsavec xgetbv1 xsaves cqm_llc cqm_occup_llc cqm_mbm_total cqm_mbm_local dtherm ida arat pln pts pku ospke avx512_vnni md_clear flush_l1d arch_capabilities
bugs		: spectre_v1 spectre_v2 spec_store_bypass swapgs taa itlb_multihit srbds mmio_stale_data retbleed
bogomips	: 5000.00
clflush size	: 64
cache_alignment	: 64
address sizes	: 46 bits physical, 48 bits virtual
power management:

EOF
done

# 生成伪造的 /proc/stat
IDLE_TIME=$((FAKE_CPU_CORES * 1000000))
cat > /tmp/fake-proc/stat << EOF
cpu  123456 0 234567 $IDLE_TIME 0 0 0 0 0 0
EOF

for ((i=0; i<FAKE_CPU_CORES; i++)); do
    echo "cpu$i 30864 0 58641 $((IDLE_TIME/FAKE_CPU_CORES)) 0 0 0 0 0 0" >> /tmp/fake-proc/stat
done

cat >> /tmp/fake-proc/stat << EOF
intr 12345678 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0
ctxt 87654321
btime 1640995200
processes 12345
procs_running 1
procs_blocked 0
softirq 1234567 0 123456 0 0 0 0 0 0 0 0
EOF

# 生成伪造的 /proc/version
cat > /tmp/fake-proc/version << EOF
Linux version 5.15.0-generic (buildd@ubuntu) (gcc (Ubuntu 11.2.0-19ubuntu1) 11.2.0, GNU ld (GNU Binutils for Ubuntu) 2.38) #72-Ubuntu SMP Fri Feb 11 17:17:17 UTC 2022
EOF

# 生成伪造的 /proc/diskstats
cat > /tmp/fake-proc/diskstats << EOF
   8       0 sda 890123 0 $FAKE_DISK_SIZE 0 567890 0 $FAKE_DISK_SIZE 0 0 0 0 0 0 0 0 0
   8       1 sda1 $((890123*9/10)) 0 $((FAKE_DISK_SIZE*9/10)) 0 $((567890*9/10)) 0 $((FAKE_DISK_SIZE*9/10)) 0 0 0 0 0 0 0 0 0
EOF

echo "伪造系统信息文件生成完成"

# 创建命令拦截器
echo "创建系统命令拦截器..."

# 创建伪造的 lscpu 命令
cat > /usr/local/bin/lscpu << 'LSCPU_EOF'
#!/bin/bash
echo "Architecture:                    x86_64"
echo "CPU op-mode(s):                  32-bit, 64-bit"
echo "Byte Order:                      Little Endian"
echo "Address sizes:                   46 bits physical, 48 bits virtual"
echo "CPU(s):                          $FAKE_CPU_CORES"
echo "On-line CPU(s) list:             0-$((FAKE_CPU_CORES-1))"
echo "Thread(s) per core:              1"
echo "Core(s) per socket:              $FAKE_CPU_CORES"
echo "Socket(s):                       1"
echo "NUMA node(s):                    1"
echo "Vendor ID:                       GenuineIntel"
echo "CPU family:                      6"
echo "Model:                           85"
echo "Model name:                      $FAKE_CPU"
echo "Stepping:                        7"
echo "CPU MHz:                         2500.000"
echo "CPU max MHz:                     3900.0000"
echo "CPU min MHz:                     1000.0000"
echo "BogoMIPS:                        5000.00"
echo "Virtualization:                  VT-x"
echo "L1d cache:                       32K"
echo "L1i cache:                       32K"
echo "L2 cache:                        1024K"
echo "L3 cache:                        27648K"
echo "NUMA node0 CPU(s):               0-$((FAKE_CPU_CORES-1))"
LSCPU_EOF

chmod +x /usr/local/bin/lscpu

# 创建伪造的 free 命令
cat > /usr/local/bin/free << 'FREE_EOF'
#!/bin/bash
if [[ "$1" == "-h" ]]; then
    echo "              total        used        free      shared  buff/cache   available"
    echo "Mem:          $((FAKE_MEM/1024/1024/1024))Gi       $((FAKE_MEM/1024/1024/1024/4))Gi       $((FAKE_MEM_FREE/1024/1024/1024))Gi       $((FAKE_MEM/1024/1024/1024/20))Gi       $((FAKE_MEM/1024/1024/1024/10))Gi       $((FAKE_MEM_AVAILABLE/1024/1024/1024))Gi"
    echo "Swap:         $((FAKE_SWAP/1024/1024/1024))Gi          0B       $((FAKE_SWAP/1024/1024/1024))Gi"
else
    echo "              total        used        free      shared  buff/cache   available"
    echo "Mem:       $((FAKE_MEM/1024))    $((FAKE_MEM/1024/4))    $((FAKE_MEM_FREE/1024))      $((FAKE_MEM/1024/20))      $((FAKE_MEM/1024/10))    $((FAKE_MEM_AVAILABLE/1024))"
    echo "Swap:      $((FAKE_SWAP/1024))           0    $((FAKE_SWAP/1024))"
fi
FREE_EOF

chmod +x /usr/local/bin/free

# 创建伪造的 nproc 命令
cat > /usr/local/bin/nproc << 'NPROC_EOF'
#!/bin/bash
echo $FAKE_CPU_CORES
NPROC_EOF

chmod +x /usr/local/bin/nproc

# 创建伪造的 df 命令（显示磁盘大小）
cat > /usr/local/bin/df << 'DF_EOF'
#!/bin/bash
if [[ "$1" == "-h" ]]; then
    echo "Filesystem      Size  Used Avail Use% Mounted on"
    echo "/dev/sda1        64G   12G   49G  20% /"
    echo "tmpfs           $((FAKE_MEM/1024/1024/1024/2))G     0  $((FAKE_MEM/1024/1024/1024/2))G   0% /dev/shm"
else
    echo "Filesystem     1K-blocks    Used Available Use% Mounted on"
    echo "/dev/sda1       67108864 12582912  51380224  20% /"
    echo "tmpfs           $((FAKE_MEM/1024/2))        0   $((FAKE_MEM/1024/2))   0% /dev/shm"
fi
DF_EOF

chmod +x /usr/local/bin/df

# 确保 /usr/local/bin 在 PATH 前面
export PATH="/usr/local/bin:$PATH"
echo 'export PATH="/usr/local/bin:$PATH"' >> /etc/bash.bashrc
echo 'export PATH="/usr/local/bin:$PATH"' >> /etc/profile

echo "系统信息伪造初始化完成: $INSTANCE_TYPE"
echo "伪造命令已创建: lscpu, free, nproc, df"
