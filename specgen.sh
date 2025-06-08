#!/bin/bash
set -e

INSTANCE_TYPE=$1

# 根据实例类型生成配置
case $INSTANCE_TYPE in
  24v64g) cores=24; mem_kb=67108864;;   # 64GB
  16v16g) cores=16; mem_kb=16777216;;   # 16GB
  4v4g)   cores=4;  mem_kb=4194304;;    # 4GB
  2v2g)   cores=2;  mem_kb=2097152;;    # 2GB
  *) echo "Unknown instance type: $INSTANCE_TYPE" >&2; exit 1;;
esac

# 生成JSON配置
cat <<EOF
{
  "cpu_cores": $cores,
  "memory_kb": $mem_kb,
  "cpu_model": "Intel(R) Xeon(R) Gold 6248 CPU @ 2.50GHz",
  "cpu_vendor": "GenuineIntel",
  "cpu_family": 6,
  "cpu_model_id": 85,
  "cpu_stepping": 7,
  "cpu_mhz": 2500.000,
  "cache_size_kb": 28160,
  "bogomips": 5000.00,
  "address_sizes": "46 bits physical, 48 bits virtual",
  "flags": "fpu vme de pse tsc msr pae mce cx8 apic sep mtrr pge mca cmov pat pse36 clflush dts acpi mmx fxsr sse sse2 ss ht tm pbe syscall nx pdpe1gb rdtscp lm constant_tsc art arch_perfmon pebs bts rep_good nopl xtopology nonstop_tsc cpuid aperfmperf pni pclmulqdq dtes64 monitor ds_cpl vmx smx est tm2 ssse3 sdbg fma cx16 xtpr pdcm pcid dca sse4_1 sse4_2 x2apic movbe popcnt tsc_deadline_timer aes xsave avx f16c rdrand lahf_lm abm 3dnowprefetch cpuid_fault epb cat_l3 cdp_l3 invpcid_single intel_ppin ssbd mba ibrs ibpb stibp ibrs_enhanced tpr_shadow vnmi flexpriority ept vpid ept_ad fsgsbase tsc_adjust bmi1 hle avx2 smep bmi2 erms invpcid rtm cqm mpx rdt_a avx512f avx512dq rdseed adx smap clflushopt clwb intel_pt avx512cd avx512bw avx512vl xsaveopt xsavec xgetbv1 xsaves cqm_llc cqm_occup_llc cqm_mbm_total cqm_mbm_local dtherm ida arat pln pts pku ospke avx512_vnni md_clear flush_l1d arch_capabilities"
}
EOF
