-- สรุปสถิติทั้งระบบ SKL-FRIS (ตัวเลขรวมเท่านั้น — ไม่มีชื่อ เบอร์ หรือพิกัดรายบ้าน)
-- ใช้เตรียมเอกสารนำเสนอผู้บริหาร · อ่านอย่างเดียว ไม่แก้ข้อมูลใด ๆ
--
-- รันบน VPS:
--   cd /opt/skl-fris && docker exec -i skl_db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -q' < scripts/system-stats.sql
-- (ถ้าไฟล์ไม่อยู่บน VPS ให้คัดลอกเนื้อหาไปวางผ่าน heredoc ได้)
--
-- "ข้อมูลที่เชื่อถือได้" ใช้นิยามเดียวกับระบบ: ใบสถานะ VERIFIED · ไม่ถูกลบ · ไม่ใช่ใบซ้ำที่ยืนยันแล้ว

\pset footer off
-- temp view อยู่เฉพาะ session นี้และหายไปเมื่อ ROLLBACK — ไม่แตะตารางจริง
BEGIN;

CREATE TEMP VIEW trusted AS
  SELECT h.*
  FROM household h
  JOIN paper_sheet s ON s.id = h."sheetId"
  WHERE h."deletedAt" IS NULL
    AND s.status = 'VERIFIED'
    AND (h."duplicateResolution" IS NULL OR h."duplicateResolution" <> 'CONFIRMED_DUPLICATE');

\echo '=== 1) สถานะแบบสอบถามทั้งหมด ==='
SELECT s.status, count(*) AS sheets
FROM paper_sheet s
GROUP BY s.status ORDER BY sheets DESC;

\echo '=== 2) ความครอบคลุมรายชุมชน ==='
SELECT c.code, c."nameTh" AS community, c."totalHouseholds" AS total_hh,
       c."targetCoveragePercent" AS target_pct,
       count(h.id) FILTER (WHERE h."deletedAt" IS NULL) AS entered,
       count(t.id) AS verified,
       CASE WHEN c."totalHouseholds" > 0
            THEN round(100.0 * count(t.id) / c."totalHouseholds", 1) END AS verified_pct
FROM community c
LEFT JOIN household h ON h."communityId" = c.id
LEFT JOIN trusted t ON t.id = h.id
WHERE c."deletedAt" IS NULL
GROUP BY c.id ORDER BY c.code;

\echo '=== 3) ภาพรวมครัวเรือนที่ตรวจแล้ว ==='
SELECT count(*) AS households,
       coalesce(sum("memberCount"), 0) AS population,
       count(*) FILTER (WHERE latitude IS NOT NULL) AS with_coords,
       count(*) FILTER (WHERE latitude IS NULL) AS no_coords,
       count(*) FILTER (WHERE "hasVulnerable" IS TRUE) AS hh_with_vulnerable,
       min("surveyedAt")::date AS first_survey,
       max("surveyedAt")::date AS last_survey
FROM trusted;

\echo '=== 4) กลุ่มเปราะบาง: จำนวนคน + ช่วงอายุ ==='
SELECT count(*) AS persons,
       count(*) FILTER (WHERE vp.age < 5) AS age_0_4,
       count(*) FILTER (WHERE vp.age BETWEEN 5 AND 17) AS age_5_17,
       count(*) FILTER (WHERE vp.age BETWEEN 18 AND 59) AS age_18_59,
       count(*) FILTER (WHERE vp.age >= 60) AS age_60_up,
       count(*) FILTER (WHERE vp.age IS NULL) AS age_unknown
FROM vulnerable_person vp JOIN trusted t ON t.id = vp."householdId";

\echo '=== 5) กลุ่มเปราะบาง: แยกระดับความเร่งด่วน ==='
SELECT coalesce(vp."triageLevel"::text, 'ยังไม่ประเมิน') AS triage, count(*) AS persons
FROM vulnerable_person vp JOIN trusted t ON t.id = vp."householdId"
GROUP BY 1 ORDER BY 1;

\echo '=== 6) กลุ่มเปราะบาง: แยกลักษณะความเปราะบาง (1 คนมีได้หลายลักษณะ) ==='
SELECT vt."nameTh" AS vulnerability, count(DISTINCT pv."personId") AS persons
FROM person_vulnerability pv
JOIN vulnerable_person vp ON vp.id = pv."personId"
JOIN trusted t ON t.id = vp."householdId"
JOIN vulnerability_type vt ON vt.id = pv."vulnerabilityTypeId"
GROUP BY vt."nameTh" ORDER BY persons DESC;

\echo '=== 7) ความต้องการความช่วยเหลือ ==='
SELECT ant."nameTh" AS need, count(DISTINCT an."householdId") AS households,
       coalesce(sum(an."personCount"), 0) AS persons
FROM assistance_need an
JOIN trusted t ON t.id = an."householdId"
JOIN assistance_need_type ant ON ant.id = an."needTypeId"
GROUP BY ant."nameTh" ORDER BY persons DESC;

\echo '=== 8) ประวัติน้ำท่วม ==='
SELECT count(*) FILTER (WHERE f."hasFloodedBefore" IS TRUE) AS flooded_before,
       count(*) FILTER (WHERE f."hasFloodedBefore" IS FALSE) AS never_flooded,
       count(*) FILTER (WHERE f."maxFloodDepthCm" > 0) AS has_depth,
       round(avg(f."maxFloodDepthCm") FILTER (WHERE f."maxFloodDepthCm" > 0)) AS avg_depth_cm,
       max(f."maxFloodDepthCm") AS max_depth_cm,
       round(avg(f."lastFloodDurationDays") FILTER (WHERE f."lastFloodDurationDays" > 0), 1) AS avg_days,
       max(f."lastFloodDurationDays") AS max_days
FROM flood_risk_profile f JOIN trusted t ON t.id = f."householdId";

\echo '=== 9) ระดับน้ำสูงสุดที่เคยท่วม (ช่วง) ==='
SELECT CASE
         WHEN f."maxFloodDepthCm" <= 50 THEN '1) ไม่เกิน 50 ซม.'
         WHEN f."maxFloodDepthCm" <= 100 THEN '2) 51-100 ซม.'
         WHEN f."maxFloodDepthCm" <= 150 THEN '3) 101-150 ซม.'
         WHEN f."maxFloodDepthCm" <= 200 THEN '4) 151-200 ซม.'
         ELSE '5) เกิน 200 ซม.'
       END AS depth_band, count(*) AS households
FROM flood_risk_profile f JOIN trusted t ON t.id = f."householdId"
WHERE f."maxFloodDepthCm" > 0
GROUP BY 1 ORDER BY 1;

\echo '=== 10) ระดับพื้นบ้านเทียบถนน ==='
SELECT coalesce(f."floorLevelVsRoad"::text, 'ไม่ระบุ') AS floor_level, count(*) AS households
FROM flood_risk_profile f JOIN trusted t ON t.id = f."householdId"
GROUP BY 1 ORDER BY 2 DESC;

\echo '=== 11) ความพร้อมรับมือ ==='
SELECT count(*) FILTER (WHERE f."hasSurvivalKit" IS FALSE) AS no_survival_kit,
       count(*) FILTER (WHERE f."hasSurvivalKit" IS TRUE) AS has_survival_kit,
       count(*) FILTER (WHERE f."canBeHostHouse" IS TRUE) AS can_be_host_house,
       count(*) FILTER (WHERE f."hasSafeParking" IS TRUE) AS safe_parking,
       (SELECT count(*) FROM trusted WHERE "hasNoResources" IS TRUE) AS no_resources
FROM flood_risk_profile f JOIN trusted t ON t.id = f."householdId";

\echo '=== 12) ยานพาหนะอพยพ ==='
SELECT ev."vehicleType"::text AS vehicle, count(DISTINCT ev."householdId") AS households
FROM evacuation_vehicle ev JOIN trusted t ON t.id = ev."householdId"
GROUP BY 1 ORDER BY 2 DESC;

\echo '=== 13) ประเภทสิ่งปลูกสร้าง ==='
SELECT coalesce(bt."nameTh", 'ไม่ระบุ') AS building, count(*) AS households
FROM trusted t LEFT JOIN building_type bt ON bt.id = t."buildingTypeId"
GROUP BY 1 ORDER BY 2 DESC;

\echo '=== 14) กรรมสิทธิ์ที่อยู่อาศัย ==='
SELECT coalesce(ot."nameTh", 'ไม่ระบุ') AS ownership, count(*) AS households
FROM trusted t LEFT JOIN ownership_type ot ON ot.id = t."ownershipTypeId"
GROUP BY 1 ORDER BY 2 DESC;

\echo '=== 15) ความพร้อมดิจิทัล + การมีส่วนร่วม ==='
SELECT (SELECT count(*) FROM digital_readiness d JOIN trusted t ON t.id = d."householdId" WHERE d."usesSmartphone" IS TRUE) AS uses_smartphone,
       (SELECT count(*) FROM digital_readiness d JOIN trusted t ON t.id = d."householdId" WHERE d."canScanQR" IS TRUE) AS can_scan_qr,
       (SELECT count(DISTINCT v."householdId") FROM volunteer_interest v JOIN trusted t ON t.id = v."householdId") AS hh_volunteer_interest,
       (SELECT count(*) FROM trusted WHERE "mentalHealthSupport" IS TRUE) AS needs_mental_health,
       (SELECT count(*) FROM trusted WHERE "povertyProgramInterest" IS TRUE) AS poverty_program_interest;

\echo '=== 16) สถานะใบยินยอม (PDPA) ==='
SELECT "consentStatus"::text AS consent, count(*) AS households
FROM trusted GROUP BY 1 ORDER BY 2 DESC;

\echo '=== 17) คุณภาพข้อมูล ==='
SELECT count(*) FILTER (WHERE "illegibleCount" > 0) AS hh_with_illegible,
       coalesce(sum("illegibleCount"), 0) AS illegible_fields,
       count(*) FILTER (WHERE "blankCount" > 0) AS hh_with_blank,
       round((avg("completenessScore") * 100)::numeric, 1) AS avg_completeness_pct
FROM trusted;

\echo '=== 18) ผู้ใช้งานระบบ (บัญชีที่เปิดใช้งาน) ==='
SELECT ur.role::text AS role, count(DISTINCT ur."userId") AS users
FROM user_role ur JOIN "user" u ON u.id = ur."userId"
WHERE ur."isActive" AND u."isActive"
GROUP BY 1 ORDER BY 2 DESC;

\echo '=== 19) คำขอลงทะเบียน ==='
SELECT status::text, count(*) FROM registration_request GROUP BY 1 ORDER BY 2 DESC;

\echo '=== 20) จำนวนใบที่คีย์ต่อเดือน ==='
SELECT to_char(date_trunc('month', h."enteredAt"), 'YYYY-MM') AS month, count(*) AS entered
FROM household h WHERE h."deletedAt" IS NULL
GROUP BY 1 ORDER BY 1;

ROLLBACK;
