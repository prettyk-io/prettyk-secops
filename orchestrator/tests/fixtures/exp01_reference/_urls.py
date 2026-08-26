import requests

h = {'Authorization': 'Token dc8ad25a2685b4e5b65603c67925914559b3d28b', 'accept': 'application/json'}
r = requests.get('http://127.0.0.1:8081/api/v2/products/?name=exp01-baseline', headers=h, timeout=10)
p = r.json()['results'][0]
pid = p['id']
print(f'Product URL: http://127.0.0.1:8081/product/{pid}')
print(f'Findings URL: http://127.0.0.1:8081/product/{pid}/findings')

r2 = requests.get(f'http://127.0.0.1:8081/api/v2/engagements/?product={pid}', headers=h, timeout=10)
engs = r2.json()['results']
for e in engs:
    print(f'Engagement URL: http://127.0.0.1:8081/engagement/{e["id"]}')

r3 = requests.get(f'http://127.0.0.1:8081/api/v2/findings/?test__engagement__product={pid}&active=true', headers=h, timeout=10)
print(f'Active findings count: {r3.json().get("count", 0)}')