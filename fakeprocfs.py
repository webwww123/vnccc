#!/usr/bin/env python3
"""
简单的FUSE假procfs实现
基于python-fuse库
"""

import os
import sys
import json
import errno
import stat
import time
from fuse import FUSE, FuseOSError, Operations

class FakeProcFS(Operations):
    def __init__(self, config_file):
        with open(config_file, 'r') as f:
            self.config = json.load(f)
        
        self.files = {
            '/cpuinfo': self._generate_cpuinfo(),
            '/meminfo': self._generate_meminfo(),
            '/stat': self._generate_stat(),
            '/loadavg': self._generate_loadavg(),
            '/version': self._generate_version(),
            '/uptime': self._generate_uptime()
        }
        
        # 添加目录
        self.dirs = {'/'}
        
    def _generate_cpuinfo(self):
        content = ""
        for i in range(self.config['cpu_cores']):
            content += f"""processor\t: {i}
vendor_id\t: {self.config['cpu_vendor']}
cpu family\t: {self.config['cpu_family']}
model\t\t: {self.config['cpu_model_id']}
model name\t: {self.config['cpu_model']}
stepping\t: {self.config['cpu_stepping']}
microcode\t: 0x5003604
cpu MHz\t\t: {self.config['cpu_mhz']}
cache size\t: {self.config['cache_size_kb']} KB
physical id\t: 0
siblings\t: {self.config['cpu_cores']}
core id\t\t: {i}
cpu cores\t: {self.config['cpu_cores']}
apicid\t\t: {i}
initial apicid\t: {i}
fpu\t\t: yes
fpu_exception\t: yes
cpuid level\t: 22
wp\t\t: yes
flags\t\t: {self.config['flags']}
bugs\t\t:
bogomips\t: {self.config['bogomips']}
clflush size\t: 64
cache_alignment\t: 64
address sizes\t: {self.config['address_sizes']}
power management:

"""
        return content.encode('utf-8')
    
    def _generate_meminfo(self):
        mem_total = self.config['memory_kb']
        mem_free = int(mem_total * 0.8)
        mem_available = int(mem_total * 0.85)
        buffers = int(mem_total * 0.02)
        cached = int(mem_total * 0.1)
        
        content = f"""MemTotal:       {mem_total} kB
MemFree:        {mem_free} kB
MemAvailable:   {mem_available} kB
Buffers:        {buffers} kB
Cached:         {cached} kB
SwapCached:     0 kB
Active:         {int(mem_total * 0.15)} kB
Inactive:       {int(mem_total * 0.05)} kB
Active(anon):   {int(mem_total * 0.1)} kB
Inactive(anon): {int(mem_total * 0.02)} kB
Active(file):   {int(mem_total * 0.05)} kB
Inactive(file): {int(mem_total * 0.03)} kB
Unevictable:    0 kB
Mlocked:        0 kB
SwapTotal:      0 kB
SwapFree:       0 kB
Dirty:          0 kB
Writeback:      0 kB
AnonPages:      {int(mem_total * 0.12)} kB
Mapped:         {int(mem_total * 0.03)} kB
Shmem:          {int(mem_total * 0.01)} kB
KReclaimable:   {int(mem_total * 0.02)} kB
Slab:           {int(mem_total * 0.03)} kB
SReclaimable:   {int(mem_total * 0.02)} kB
SUnreclaim:     {int(mem_total * 0.01)} kB
KernelStack:    {int(mem_total * 0.001)} kB
PageTables:     {int(mem_total * 0.01)} kB
NFS_Unstable:   0 kB
Bounce:         0 kB
WritebackTmp:   0 kB
CommitLimit:    {int(mem_total / 2)} kB
Committed_AS:   {int(mem_total * 0.2)} kB
VmallocTotal:   34359738367 kB
VmallocUsed:    0 kB
VmallocChunk:   0 kB
Percpu:         {self.config['cpu_cores'] * 32} kB
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
DirectMap4k:     {int(mem_total / 4)} kB
DirectMap2M:     {int(mem_total * 3 / 4)} kB
DirectMap1G:     0 kB
"""
        return content.encode('utf-8')
    
    def _generate_stat(self):
        cores = self.config['cpu_cores']
        content = "cpu  0 0 0 0 0 0 0 0 0 0\n"
        for i in range(cores):
            content += f"cpu{i} 0 0 0 0 0 0 0 0 0 0\n"
        content += """intr 0
ctxt 0
btime 1733673600
processes 1
procs_running 1
procs_blocked 0
softirq 0 0 0 0 0 0 0 0 0 0 0
"""
        return content.encode('utf-8')
    
    def _generate_loadavg(self):
        return "0.00 0.00 0.00 1/100 1000\n".encode('utf-8')
    
    def _generate_version(self):
        return "Linux version 5.15.0-generic (buildd@ubuntu) (gcc (Ubuntu 11.2.0-19ubuntu1) 11.2.0, GNU ld (GNU Binutils for Ubuntu) 2.38) #72-Ubuntu SMP Fri Feb 11 17:17:17 UTC 2022\n".encode('utf-8')
    
    def _generate_uptime(self):
        return "1000.00 800.00\n".encode('utf-8')

    def getattr(self, path, fh=None):
        if path in self.dirs:
            st = dict(st_mode=(stat.S_IFDIR | 0o755), st_nlink=2)
        elif path in self.files:
            st = dict(st_mode=(stat.S_IFREG | 0o444), st_nlink=1, st_size=len(self.files[path]))
        else:
            raise FuseOSError(errno.ENOENT)
        
        st['st_ctime'] = st['st_mtime'] = st['st_atime'] = time.time()
        return st

    def readdir(self, path, fh):
        if path != '/':
            raise FuseOSError(errno.ENOENT)
        
        dirents = ['.', '..']
        for filepath in self.files:
            dirents.append(filepath[1:])  # 去掉开头的 /
        return dirents

    def read(self, path, length, offset, fh):
        if path not in self.files:
            raise FuseOSError(errno.ENOENT)
        
        data = self.files[path]
        return data[offset:offset + length]

def main():
    if len(sys.argv) != 3:
        print(f"Usage: {sys.argv[0]} <config.json> <mountpoint>")
        sys.exit(1)
    
    config_file = sys.argv[1]
    mountpoint = sys.argv[2]
    
    FUSE(FakeProcFS(config_file), mountpoint, nothreads=True, foreground=False)

if __name__ == '__main__':
    main()
