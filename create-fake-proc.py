#!/usr/bin/env python3
import json
import sys
import os

def create_fake_proc_files():
    with open('/etc/fake.json', 'r') as f:
        config = json.load(f)
    
    # 确保目录存在
    os.makedirs('/fake', exist_ok=True)
    
    # 创建假的cpuinfo
    with open('/fake/cpuinfo', 'w') as f:
        for i in range(config['cpu_cores']):
            f.write(f"""processor\t: {i}
vendor_id\t: {config['cpu_vendor']}
cpu family\t: {config['cpu_family']}
model\t\t: {config['cpu_model']}
model name\t: {config['cpu_model']}
stepping\t: {config['cpu_stepping']}
microcode\t: 0x{config['cpu_model_id']:x}
cpu MHz\t\t: {config['cpu_mhz']:.3f}
cache size\t: {config['cache_size_kb']} KB
physical id\t: 0
siblings\t: {config['cpu_cores']}
core id\t\t: {i}
cpu cores\t: {config['cpu_cores']}
apicid\t\t: {i}
initial apicid\t: {i}
fpu\t\t: yes
fpu_exception\t: yes
cpuid level\t: 22
wp\t\t: yes
flags\t\t: {config['flags']}
bugs\t\t:
bogomips\t: {config['bogomips']:.2f}
clflush size\t: 64
cache_alignment\t: 64
address sizes\t: {config['address_sizes']}
power management:

""")
    
    # 创建假的meminfo
    with open('/fake/meminfo', 'w') as f:
        mem_total = config['memory_kb']
        mem_free = int(mem_total * 0.8)
        mem_available = int(mem_total * 0.85)
        f.write(f"""MemTotal:       {mem_total} kB
MemFree:        {mem_free} kB
MemAvailable:   {mem_available} kB
Buffers:        {int(mem_total * 0.02)} kB
Cached:         {int(mem_total * 0.1)} kB
SwapCached:            0 kB
Active:         {int(mem_total * 0.05)} kB
Inactive:       {int(mem_total * 0.03)} kB
Active(anon):   {int(mem_total * 0.03)} kB
Inactive(anon):        0 kB
Active(file):   {int(mem_total * 0.02)} kB
Inactive(file): {int(mem_total * 0.03)} kB
Unevictable:           0 kB
Mlocked:               0 kB
SwapTotal:             0 kB
SwapFree:              0 kB
Dirty:                 0 kB
Writeback:             0 kB
AnonPages:      {int(mem_total * 0.03)} kB
Mapped:         {int(mem_total * 0.01)} kB
Shmem:                 0 kB
Slab:           {int(mem_total * 0.01)} kB
SReclaimable:   {int(mem_total * 0.005)} kB
SUnreclaim:     {int(mem_total * 0.005)} kB
KernelStack:        1024 kB
PageTables:         2048 kB
NFS_Unstable:          0 kB
Bounce:                0 kB
WritebackTmp:          0 kB
CommitLimit:    {int(mem_total / 2)} kB
Committed_AS:   {int(mem_total * 0.1)} kB
VmallocTotal:   34359738367 kB
VmallocUsed:           0 kB
VmallocChunk:          0 kB
Percpu:             1024 kB
HardwareCorrupted:     0 kB
AnonHugePages:         0 kB
ShmemHugePages:        0 kB
ShmemPmdMapped:        0 kB
HugePages_Total:       0
HugePages_Free:        0
HugePages_Rsvd:        0
HugePages_Surp:        0
Hugepagesize:       2048 kB
Hugetlb:               0 kB
DirectMap4k:      102400 kB
DirectMap2M:     4096000 kB
DirectMap1G:    {int(mem_total / 1024 / 1024) * 1024 * 1024} kB
""")
    
    print('✅ 静态假procfs文件创建完成')

if __name__ == '__main__':
    create_fake_proc_files()
