import requests, os

os.environ['PK_DEFECTDOJO_URL'] = 'http://127.0.0.1:8081'
os.environ['PK_DEFECTDOJO_TOKEN'] = 'dc8ad25a2685b4e5b65603c67925914559b3d28b'
token = os.environ['PK_DEFECTDOJO_TOKEN']
headers = {'Authorization': f'Token {token}', 'accept': 'application/json'}

r = requests.get('http://127.0.0.1:8081/api/v2/products/?limit=50', headers=headers, timeout=10)
prods = r.json().get('results', [])
print(f'Products ({len(prods)}):')
for p in prods:
    print(f'  id={p["id"]} name={p["name"]}')

r2 = requests.get('http://127.0.0.1:8081/api/v2/engagements/?limit=50', headers=headers, timeout=10)
engs = r2.json().get('results', [])
print(f'Engagements ({len(engs)}):')
for e in engs:
    print(f'  id={e["id"]} name={e.get("name")} product={e.get("product")}')