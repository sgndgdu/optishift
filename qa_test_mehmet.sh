#!/bin/bash
# OptiShift QA Test Script - Mehmet Demir (P003)
# Çalıştır: bash qa_test_mehmet.sh 2>&1 | tee qa_results.txt

BASE="http://localhost:3000"
PID="P003"
OUTPUT_FILE="qa_results.txt"

echo "======================================================="
echo "  OptiShift QA - Mehmet Demir (P003) - $(date)"
echo "======================================================="
echo ""

# ---- ADIM 1: LOGIN ----
echo "### ADIM 1: LOGIN ###"
LOGIN=$(curl -s -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"mehmet@gratis-izmir.com","password":"1234"}')
echo "Yanıt: $LOGIN"
echo ""

# ---- ADIM 2: VARDIYAS GÖR ----
echo "### ADIM 2: VARDİYALAR (2026-08-22) ###"
SHIFTS=$(curl -s "$BASE/api/shifts?personnel_id=$PID&week_start=2026-08-22")
echo "Yanıt: $SHIFTS"
echo ""

# ---- ADIM 3: MÜSAİTLİK GÖNDER (2026-06-02) ----
echo "### ADIM 3: MÜSAİTLİK GÖNDER (2026-06-02) ###"
AVAIL_POST=$(curl -s -X POST "$BASE/api/availability" \
  -H "Content-Type: application/json" \
  -d '{
    "personnel_id": "P003",
    "week_start": "2026-06-02",
    "days": [
      {"status": "preferred_not"},
      {"status": "available"},
      {"status": "available"},
      {"status": "unavailable"},
      {"status": "available"},
      {"status": "partial", "start": "09:00", "end": "13:00"},
      {"status": "unavailable"}
    ]
  }')
echo "Yanıt: $AVAIL_POST"
echo ""

# ---- ADIM 4: İZİN TALEBİ OLUŞTUR ----
echo "### ADIM 4: İZİN TALEBİ (excuse, 2026-06-15) ###"
LEAVE=$(curl -s -X POST "$BASE/api/leave-requests" \
  -H "Content-Type: application/json" \
  -d '{
    "personnel_id": "P003",
    "type": "excuse",
    "start_date": "2026-06-15",
    "end_date": "2026-06-15",
    "days": 1,
    "note": "Sınav"
  }')
echo "Yanıt: $LEAVE"
echo ""

# ---- ADIM 5: MÜSAİTLİK GÜNCELLE (tüm günler available) ----
echo "### ADIM 5: MÜSAİTLİK GÜNCELLE - Tüm günler available (2026-06-02) ###"
AVAIL_UPDATE=$(curl -s -X POST "$BASE/api/availability" \
  -H "Content-Type: application/json" \
  -d '{
    "personnel_id": "P003",
    "week_start": "2026-06-02",
    "days": [
      {"status": "available"},
      {"status": "available"},
      {"status": "available"},
      {"status": "available"},
      {"status": "available"},
      {"status": "available"},
      {"status": "available"}
    ]
  }')
echo "Yanıt: $AVAIL_UPDATE"
echo ""

# ---- ADIM 6: GÜNCELLEMEYİ DOĞRULA ----
echo "### ADIM 6: GÜNCELLEMEYİ DOĞRULA (GET) ###"
AVAIL_GET=$(curl -s "$BASE/api/availability?personnel_id=$PID&week_start=2026-06-02")
echo "Yanıt: $AVAIL_GET"
echo ""

# ---- ADIM 7: EKSİK BODY İLE POST (days YOK) ----
echo "### ADIM 7: VALIDATION TEST - days alanı eksik ###"
INVALID=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST "$BASE/api/availability" \
  -H "Content-Type: application/json" \
  -d '{"personnel_id":"P003","week_start":"2026-06-02"}')
echo "Yanıt: $INVALID"
echo ""

# ---- ADIM 7b: days boş dizi ----
echo "### ADIM 7b: VALIDATION TEST - days boş dizi ###"
EMPTY_DAYS=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST "$BASE/api/availability" \
  -H "Content-Type: application/json" \
  -d '{"personnel_id":"P003","week_start":"2026-06-02","days":[]}')
echo "Yanıt: $EMPTY_DAYS"
echo ""

# ---- ADIM 7c: Geçersiz status değeri ----
echo "### ADIM 7c: VALIDATION TEST - geçersiz status ###"
BAD_STATUS=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST "$BASE/api/availability" \
  -H "Content-Type: application/json" \
  -d '{"personnel_id":"P003","week_start":"2026-06-02","days":[{"status":"INVALID"},{"status":"available"},{"status":"available"},{"status":"available"},{"status":"available"},{"status":"available"},{"status":"available"}]}')
echo "Yanıt: $BAD_STATUS"
echo ""

# ---- ADIM 7d: Geçersiz tarih formatı ----
echo "### ADIM 7d: VALIDATION TEST - geçersiz tarih ###"
BAD_DATE=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST "$BASE/api/availability" \
  -H "Content-Type: application/json" \
  -d '{"personnel_id":"P003","week_start":"02-06-2026","days":[{"status":"available"},{"status":"available"},{"status":"available"},{"status":"available"},{"status":"available"},{"status":"available"},{"status":"available"}]}')
echo "Yanıt: $BAD_DATE"
echo ""

# ---- ADIM 7e: Yanlış personnel_id ----
echo "### ADIM 7e: VALIDATION TEST - yanlış personnel_id ###"
BAD_PID=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST "$BASE/api/availability" \
  -H "Content-Type: application/json" \
  -d '{"personnel_id":"P999","week_start":"2026-06-02","days":[{"status":"available"},{"status":"available"},{"status":"available"},{"status":"available"},{"status":"available"},{"status":"available"},{"status":"available"}]}')
echo "Yanıt: $BAD_PID"
echo ""

# ---- ADIM 7f: partial ama start/end eksik ----
echo "### ADIM 7f: VALIDATION TEST - partial status, start/end yok ###"
PARTIAL_NO_TIME=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST "$BASE/api/availability" \
  -H "Content-Type: application/json" \
  -d '{"personnel_id":"P003","week_start":"2026-06-09","days":[{"status":"partial"},{"status":"available"},{"status":"available"},{"status":"available"},{"status":"available"},{"status":"available"},{"status":"available"}]}')
echo "Yanıt: $PARTIAL_NO_TIME"
echo ""

# ---- ADIM 7g: DELETE sonrası GET ----
echo "### ADIM 7g: DELETE müsaitlik testi ###"
DEL=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X DELETE "$BASE/api/availability?personnel_id=$PID&week_start=2026-06-09")
echo "DELETE Yanıtı: $DEL"
echo ""

# ---- ADIM 7h: İzin talepleri listesi ----
echo "### ADIM 7h: İZİN TALEPLERİ LİSTESİ ###"
LEAVES=$(curl -s "$BASE/api/leave-requests?personnel_id=$PID")
echo "Yanıt: $LEAVES"
echo ""

# ---- ADIM 8: BİLDİRİMLER ----
echo "### ADIM 8: BİLDİRİMLER ###"
NOTIFS=$(curl -s "$BASE/api/notifications?personnel_id=$PID")
echo "Yanıt: $NOTIFS"
echo ""

# ---- BİLDİRİM OKUNDU IŞARETLEME (varsa) ----
echo "### ADIM 8b: İLK BİLDİRİMİ OKUNDU İŞARETLE ###"
NOTIF_ID=$(echo $NOTIFS | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0]['id'] if isinstance(d,list) and len(d)>0 else 'NONE')" 2>/dev/null)
echo "Bildirim ID: $NOTIF_ID"
if [ "$NOTIF_ID" != "NONE" ] && [ -n "$NOTIF_ID" ]; then
  MARK_READ=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X PUT "$BASE/api/notifications?personnel_id=$PID&id=$NOTIF_ID")
  echo "Okundu işaretleme yanıtı: $MARK_READ"
fi
echo ""

echo "======================================================="
echo "  TÜM TESTLER TAMAMLANDI"
echo "======================================================="
