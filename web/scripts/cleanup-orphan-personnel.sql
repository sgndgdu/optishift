-- Orphan personnel kayıtlarını listele (users tablosunda karşılığı olmayanlar)
-- Silmeden önce bu sorguyu çalıştırıp sonucu incele:
SELECT p.id, p.name, p.org_id, p.created_at
FROM personnel p
WHERE NOT EXISTS (
  SELECT 1 FROM users u WHERE u.personnel_id = p.id
);

-- Doğruladıktan sonra silmek için:
-- DELETE FROM personnel
-- WHERE NOT EXISTS (
--   SELECT 1 FROM users u WHERE u.personnel_id = id
-- );
