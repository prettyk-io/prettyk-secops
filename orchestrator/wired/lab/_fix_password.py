from pathlib import Path

p = Path(__file__).with_name("manifest_juice_fuzz.json")
text = p.read_text(encoding="utf-8")
# JSON text contains escaped quotes: \"
commented = '# Секрет $password_value = \\"pk_password\\"'
live = 'Секрет $password_value = \\"pk_password\\"'
if commented not in text:
    if live in text:
        print("password already live")
        raise SystemExit(0)
    raise SystemExit("password line not found")
p.write_text(text.replace(commented, live, 1), encoding="utf-8")
print("uncommented password secret")
