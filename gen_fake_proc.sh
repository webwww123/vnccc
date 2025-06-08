#!/bin/bash
set -e

cid=$1            # 传入容器ID
spec=$2           # 2v2g | 4v4g | 16v16g | 24v64g

# 填写对照表
case $spec in
  24v64g) cores=24; mem=67108864;;   # kB
  16v16g) cores=16; mem=16777216;;
  4v4g)   cores=4;  mem=4194304;;
  2v2g)   cores=2;  mem=2097152;;
  *) echo "Unknown spec: $spec"; exit 1;;
esac

echo "生成伪造硬件信息: $spec -> ${cores}核 ${mem}KB内存"

d=/var/lib/sysbox/proc/$cid
mkdir -p $d

# 生成 cpuinfo
cat >$d/cpuinfo <<EOF
processor	: 0
vendor_id	: GenuineIntel
cpu family	: 6
model		: 85
model name	: Intel(R) Xeon(R) Gold 6248 CPU @ 2.50GHz
stepping	: 7
microcode	: 0x5003604
cpu MHz		: 2500.000
cache size	: 28160 KB
physical id	: 0
siblings	: $cores
core id		: 0
cpu cores	: $cores
apicid		: 0
initial apicid	: 0
fpu		: yes
fpu_exception	: yes
cpuid level	: 22
wp		: yes
flags		: fpu vme de pse tsc msr pae mce cx8 apic sep mtrr pge mca cmov pat pse36 clflush dts acpi mmx fxsr sse sse2 ss ht tm pbe syscall nx pdpe1gb rdtscp lm constant_tsc art arch_perfmon pebs bts rep_good nopl xtopology nonstop_tsc cpuid aperfmperf pni pclmulqdq dtes64 monitor ds_cpl vmx smx est tm2 ssse3 sdbg fma cx16 xtpr pdcm pcid dca sse4_1 sse4_2 x2apic movbe popcnt tsc_deadline_timer aes xsave avx f16c rdrand lahf_lm abm 3dnowprefetch cpuid_fault epb cat_l3 cdp_l3 invpcid_single intel_ppin ssbd mba ibrs ibpb stibp ibrs_enhanced tpr_shadow vnmi flexpriority ept vpid ept_ad fsgsbase tsc_adjust bmi1 hle avx2 smep bmi2 erms invpcid rtm cqm mpx rdt_a avx512f avx512dq rdseed adx smap clflushopt clwb intel_pt avx512cd avx512bw avx512vl xsaveopt xsavec xgetbv1 xsaves cqm_llc cqm_occup_llc cqm_mbm_total cqm_mbm_local dtherm ida arat pln pts pku ospke avx512_vnni md_clear flush_l1d arch_capabilities
bugs		:
bogomips	: 5000.00
clflush size	: 64
cache_alignment	: 64
address sizes	: 46 bits physical, 48 bits virtual
power management:

EOF

# 为多核生成额外的processor条目
for ((i=1; i<$cores; i++)); do
  cat >>$d/cpuinfo <<EOF
processor	: $i
vendor_id	: GenuineIntel
cpu family	: 6
model		: 85
model name	: Intel(R) Xeon(R) Gold 6248 CPU @ 2.50GHz
stepping	: 7
microcode	: 0x5003604
cpu MHz		: 2500.000
cache size	: 28160 KB
physical id	: 0
siblings	: $cores
core id		: $i
cpu cores	: $cores
apicid		: $i
initial apicid	: $i
fpu		: yes
fpu_exception	: yes
cpuid level	: 22
wp		: yes
flags		: fpu vme de pse tsc msr pae mce cx8 apic sep mtrr pge mca cmov pat pse36 clflush dts acpi mmx fxsr sse sse2 ss ht tm pbe syscall nx pdpe1gb rdtscp lm constant_tsc art arch_perfmon pebs bts rep_good nopl xtopology nonstop_tsc cpuid aperfmperf pni pclmulqdq dtes64 monitor ds_cpl vmx smx est tm2 ssse3 sdbg fma cx16 xtpr pdcm pcid dca sse4_1 sse4_2 x2apic movbe popcnt tsc_deadline_timer aes xsave avx f16c rdrand lahf_lm abm 3dnowprefetch cpuid_fault epb cat_l3 cdp_l3 invpcid_single intel_ppin ssbd mba ibrs ibpb stibp ibrs_enhanced tpr_shadow vnmi flexpriority ept vpid ept_ad fsgsbase tsc_adjust bmi1 hle avx2 smep bmi2 erms invpcid rtm cqm mpx rdt_a avx512f avx512dq rdseed adx smap clflushopt clwb intel_pt avx512cd avx512bw avx512vl xsaveopt xsavec xgetbv1 xsaves cqm_llc cqm_occup_llc cqm_mbm_total cqm_mbm_local dtherm ida arat pln pts pku ospke avx512_vnni md_clear flush_l1d arch_capabilities
bugs		:
bogomips	: 5000.00
clflush size	: 64
cache_alignment	: 64
address sizes	: 46 bits physical, 48 bits virtual
power management:

EOF
done

# 生成 meminfo
cat >$d/meminfo <<EOF
MemTotal:       $mem kB
MemFree:        $((mem * 80 / 100)) kB
MemAvailable:   $((mem * 85 / 100)) kB
Buffers:        $((mem * 2 / 100)) kB
Cached:         $((mem * 10 / 100)) kB
SwapCached:     0 kB
Active:         $((mem * 15 / 100)) kB
Inactive:       $((mem * 5 / 100)) kB
Active(anon):   $((mem * 10 / 100)) kB
Inactive(anon): $((mem * 2 / 100)) kB
Active(file):   $((mem * 5 / 100)) kB
Inactive(file): $((mem * 3 / 100)) kB
Unevictable:    0 kB
Mlocked:        0 kB
SwapTotal:      0 kB
SwapFree:       0 kB
Dirty:          0 kB
Writeback:      0 kB
AnonPages:      $((mem * 12 / 100)) kB
Mapped:         $((mem * 3 / 100)) kB
Shmem:          $((mem * 1 / 100)) kB
KReclaimable:   $((mem * 2 / 100)) kB
Slab:           $((mem * 3 / 100)) kB
SReclaimable:   $((mem * 2 / 100)) kB
SUnreclaim:     $((mem * 1 / 100)) kB
KernelStack:    $((mem * 1 / 1000)) kB
PageTables:     $((mem * 1 / 100)) kB
NFS_Unstable:   0 kB
Bounce:         0 kB
WritebackTmp:   0 kB
CommitLimit:    $((mem / 2)) kB
Committed_AS:   $((mem * 20 / 100)) kB
VmallocTotal:   34359738367 kB
VmallocUsed:    0 kB
VmallocChunk:   0 kB
Percpu:         $((cores * 32)) kB
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
DirectMap4k:     $((mem / 4)) kB
DirectMap2M:     $((mem * 3 / 4)) kB
DirectMap1G:     0 kB
EOF

# 生成 stat (CPU统计信息)
cat >$d/stat <<EOF
cpu  0 0 0 0 0 0 0 0 0 0
EOF

for ((i=0; i<$cores; i++)); do
  echo "cpu$i 0 0 0 0 0 0 0 0 0 0" >>$d/stat
done

cat >>$d/stat <<EOF
intr 0
ctxt 0
btime 1733673600
processes 1
procs_running 1
procs_blocked 0
softirq 0 0 0 0 0 0 0 0 0 0 0
EOF

echo "伪造文件已生成到: $d"
ls -la $d/
