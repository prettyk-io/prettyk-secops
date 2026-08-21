"""Create exp01-baseline product + engagement in fresh Dojo."""
import requests, os

os.environ['KDT_DEFECTDOJO_URL'] = 'http://127.0.0.1:8081'
os.environ['KDT_DEFECTDOJO_TOKEN'] = 'dc8ad25a2685b4e5b65603c67925914559b3d28b'
token = os.environ['KDT_DEFECTDOJO_TOKEN']
headers = {'Authorization': f'Token {token}', 'accept': 'application/json', 'Content-Type': 'application/json'}

# Create product
prod_payload = {
    'name': 'exp01-baseline',
    'description': 'EXP-01 baseline reference run - Juice Shop',
    'prod_type': 1,  # Research and Development
}
r = requests.post('http://127.0.0.1:8081/api/v2/products/', headers=headers, json=prod_payload, timeout=10)
if r.status_code in (200, 201):
    product = r.json()
    print(f'Product created: id={product["id"]} name={product["name"]}')
else:
    print(f'Product FAILED: {r.status_code} {r.text[:200]}')
    exit(1)

# Create engagement
eng_payload = {
    'name': 'EXP-01 Reference Run',
    'description': 'Baseline E2E run - no AI, no tuning',
    'product': product['id'],
    'target_start': '2026-08-20',
    'target_end': '2026-08-21',
    'engagement_type': 'CI/CD',
    'status': 'In Progress',
}
r2 = requests.post('http://127.0.0.1:8081/api/v2/engagements/', headers=headers, json=eng_payload, timeout=10)
if r2.status_code in (200, 201):
    engagement = r2.json()
    print(f'Engagement created: id={engagement["id"]} name={engagement["name"]}')
    print(f'\nKDT_DEFECTDOJO_ENGAGEMENT={engagement["id"]}')
else:
    print(f'Engagement FAILED: {r2.status_code} {r2.text[:200]}')
    exit(1)