SELECT COALESCE((SELECT preferences FROM settings WHERE id=1),'{}')
