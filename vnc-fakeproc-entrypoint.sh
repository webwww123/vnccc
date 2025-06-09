#!/bin/bash

# VNC专用轻量硬件伪造脚本
# 只修改基本的/proc文件，不影响supervisor服务

echo "🚀 VNC硬件伪造启动..."

# 检查是否有CAP_SYS_ADMIN权限
if ! capsh --print | grep -q "cap_sys_admin"; then
    echo "❌ 缺少CAP_SYS_ADMIN权限，无法进行硬件伪造"
    exec "$@"
fi

echo "✅ 检测到CAP_SYS_ADMIN权限"

# 获取配置参数
FAKE_CPU_CORES=${FAKE_CPU_CORES:-24}
FAKE_MEMORY_GB=${FAKE_MEMORY_GB:-64}
FAKE_CPU_MODEL=${FAKE_CPU_MODEL:-"Intel(R) Xeon(R) Gold 6248 CPU @ 2.50GHz"}

echo "🎯 配置硬件伪造: ${FAKE_CPU_CORES}核 ${FAKE_MEMORY_GB}GB"

# 创建伪造文件目录
mkdir -p /tmp/fake_proc

# 1. 伪造/proc/cpuinfo (24核Intel Xeon)
echo "📝 创建假的/proc/cpuinfo..."
cat > /tmp/fake_proc/cpuinfo << EOF
$(for i in $(seq 0 $((FAKE_CPU_CORES-1))); do
cat << CPUEOF
processor	: $i
vendor_id	: GenuineIntel
cpu family	: 6
model		: 85
model name	: $FAKE_CPU_MODEL
stepping	: 7
microcode	: 0x5003006
cpu MHz		: 2500.000
cache size	: 28160 KB
physical id	: $((i/12))
siblings	: 24
core id		: $((i%12))
cpu cores	: 12
apicid		: $i
initial apicid	: $i
fpu		: yes
fpu_exception	: yes
cpuid level	: 22
wp		: yes
flags		: fpu vme de pse tsc msr pae mce cx8 apic sep mtrr pge mca cmov pat pse36 clflush dts acpi mmx fxsr sse sse2 ss ht tm pbe syscall nx pdpe1gb rdtscp lm constant_tsc art arch_perfmon pebs bts rep_good nopl xtopology nonstop_tsc cpuid aperfmperf pni pclmulqdq dtes64 monitor ds_cpl vmx smx est tm2 ssse3 sdbg fma cx16 xtpr pdcm pcid dca sse4_1 sse4_2 x2apic movbe popcnt tsc_deadline_timer aes xsave avx f16c rdrand lahf_lm abm 3dnowprefetch cpuid_fault epb cat_l3 cdp_l3 invpcid_single intel_ppin ssbd mba ibrs ibpb stibp ibrs_enhanced tpr_shadow vnmi flexpriority ept vpid ept_ad fsgsbase tsc_adjust bmi1 avx2 smep bmi2 erms invpcid cqm mpx rdt_a avx512f avx512dq rdseed adx smap clflushopt clwb intel_pt avx512cd avx512bw avx512vl xsaveopt xsavec xgetbv1 xsaves cqm_llc cqm_occup_llc cqm_mbm_total cqm_mbm_local dtherm ida arat pln pts hwp hwp_act_window hwp_epp hwp_pkg_req pku ospke avx512_vnni md_clear flush_l1d arch_capabilities
bugs		:
bogomips	: 5000.00
clflush size	: 64
cache_alignment	: 64
address sizes	: 46 bits physical, 48 bits virtual
power management:

CPUEOF
done)
EOF

# 2. 伪造/proc/meminfo (64GB内存)
echo "💾 创建假的/proc/meminfo..."
FAKE_MEMORY_KB=$((FAKE_MEMORY_GB * 1024 * 1024))
cat > /tmp/fake_proc/meminfo << EOF
MemTotal:       $FAKE_MEMORY_KB kB
MemFree:        $((FAKE_MEMORY_KB * 80 / 100)) kB
MemAvailable:   $((FAKE_MEMORY_KB * 85 / 100)) kB
Buffers:        $((FAKE_MEMORY_KB * 2 / 100)) kB
Cached:         $((FAKE_MEMORY_KB * 10 / 100)) kB
SwapCached:            0 kB
Active:         $((FAKE_MEMORY_KB * 15 / 100)) kB
Inactive:       $((FAKE_MEMORY_KB * 5 / 100)) kB
Active(anon):   $((FAKE_MEMORY_KB * 8 / 100)) kB
Inactive(anon):        32 kB
Active(file):   $((FAKE_MEMORY_KB * 7 / 100)) kB
Inactive(file): $((FAKE_MEMORY_KB * 5 / 100)) kB
Unevictable:           0 kB
Mlocked:               0 kB
SwapTotal:             0 kB
SwapFree:              0 kB
Dirty:                64 kB
Writeback:             0 kB
AnonPages:      $((FAKE_MEMORY_KB * 8 / 100)) kB
Mapped:         $((FAKE_MEMORY_KB * 1 / 100)) kB
Shmem:                96 kB
KReclaimable:   $((FAKE_MEMORY_KB * 2 / 100)) kB
Slab:           $((FAKE_MEMORY_KB * 3 / 100)) kB
SReclaimable:   $((FAKE_MEMORY_KB * 2 / 100)) kB
SUnreclaim:     $((FAKE_MEMORY_KB * 1 / 100)) kB
KernelStack:        2048 kB
PageTables:         4096 kB
NFS_Unstable:          0 kB
Bounce:                0 kB
WritebackTmp:          0 kB
CommitLimit:    $((FAKE_MEMORY_KB / 2)) kB
Committed_AS:   $((FAKE_MEMORY_KB * 10 / 100)) kB
VmallocTotal:   34359738367 kB
VmallocUsed:        8192 kB
VmallocChunk:          0 kB
Percpu:             1024 kB
HardwareCorrupted:     0 kB
AnonHugePages:         0 kB
ShmemHugePages:        0 kB
ShmemPmdMapped:        0 kB
FileHugePages:         0 kB
FilePmdMapped:         0 kB
HugePages_Total:       0
HugePages_Free:        0
HugePages_Rsvd:        0
HugePages_Surp:        0
Hugepagesize:       2048 kB
Hugetlb:               0 kB
DirectMap4k:      131072 kB
DirectMap2M:     4063232 kB
DirectMap1G:    $((FAKE_MEMORY_KB - 4194304)) kB
EOF

# 3. 创建假的sys文件系统结构 (lscpu支持)
echo "🔗 创建假的sys CPU目录..."
if [ -d /sys/devices/system/cpu ]; then
    # 用tmpfs覆盖
    mount -t tmpfs tmpfs /sys/devices/system/cpu 2>/dev/null || true

    # 创建假的CPU目录结构（24个CPU）
    for i in $(seq 0 $((FAKE_CPU_CORES-1))); do
        mkdir -p /sys/devices/system/cpu/cpu$i
        echo 1 > /sys/devices/system/cpu/cpu$i/online 2>/dev/null || true
    done

    # 创建online文件
    echo "0-$((FAKE_CPU_CORES-1))" > /sys/devices/system/cpu/online 2>/dev/null || true
    echo "0-$((FAKE_CPU_CORES-1))" > /sys/devices/system/cpu/present 2>/dev/null || true
    echo "0-$((FAKE_CPU_CORES-1))" > /sys/devices/system/cpu/possible 2>/dev/null || true

    echo "✅ 创建了${FAKE_CPU_CORES}个假CPU目录"
fi

# 4. 轻量级bind mount (只覆盖关键文件)
echo "🔗 应用硬件伪造..."
mount --bind /tmp/fake_proc/cpuinfo /proc/cpuinfo 2>/dev/null || echo "⚠️ cpuinfo bind mount失败"
mount --bind /tmp/fake_proc/meminfo /proc/meminfo 2>/dev/null || echo "⚠️ meminfo bind mount失败"

# 5. 创建简单的nproc wrapper (不影响系统服务)
if [ -f /usr/bin/nproc ]; then
    cp /usr/bin/nproc /usr/bin/nproc.orig 2>/dev/null || true
    cat > /usr/bin/nproc << 'EOF'
#!/bin/bash
echo "24"
EOF
    chmod +x /usr/bin/nproc 2>/dev/null || true
fi

echo "✅ VNC硬件伪造完成: ${FAKE_CPU_CORES}核 ${FAKE_MEMORY_GB}GB Intel Xeon"
echo "🔒 启动VNC服务..."

# 启动原始VNC服务
exec "$@"
