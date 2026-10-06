#!/bin/zsh
# Bütün sahneleri doğru veri sırasıyla çeker. Önce motor (8000) ve next start (3100) açık olmalı.
# seed: vitrini sıfırlar (gelecek hafta boş, bekleyen istekler yerinde). Sonra: node scripts/vid/publish.mjs
cd "$(dirname "$0")/../.."
seed() { node scripts/seed_vitrin.mjs | tail -1; }
run() { echo "▶ $*"; env "$@" 2>&1 | grep -E "count|Error|waiting for" | head -2; }
seed
run node scripts/vid/m_manager.mjs autopilot
seed
run MOBILE=1 node scripts/vid/m_manager.mjs autopilot
# Plan oluştur + yayınla, sonra plana bağlı sahneler
run node scripts/vid/s1_plan.mjs
run node scripts/vid/s2_phone.mjs
run node scripts/vid/s5_assistant.mjs
run MOBILE=1 node scripts/vid/s5_assistant.mjs
for s in availability leave swap open chat; do run node scripts/vid/e_team.mjs $s; done
run node scripts/vid/s4_cover.mjs
run node scripts/vid/m_manager.mjs fairness
run MOBILE=1 node scripts/vid/m_manager.mjs fairness
run node scripts/vid/m_manager.mjs reports
run MOBILE=1 node scripts/vid/m_manager.mjs reports
run node scripts/vid/m_manager.mjs team
seed
run MOBILE=1 node scripts/vid/m_manager.mjs team
seed
run MOBILE=1 node scripts/vid/s1_plan.mjs
run MOBILE=1 node scripts/vid/s4_cover.mjs
seed
run node scripts/vid/s3_approvals.mjs
seed
run MOBILE=1 node scripts/vid/s3_approvals.mjs
seed
echo FIN
