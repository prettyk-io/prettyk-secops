"""Parse ZAP XML report to structured JSON alerts — as fallback when ZAP API hangs."""
import json, os, sys, xml.etree.ElementTree as ET

BASE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(BASE, '..', '..', '..', '..'))
sys.path.insert(0, os.path.join(ROOT, 'orchestrator'))

xml_path = os.path.join(BASE, 'zap_raw_report.xml')
tree = ET.parse(xml_path)
root_el = tree.getroot()

alerts = []
for site in root_el.findall('.//site'):
    site_name = site.attrib.get('name', '')
    for item in site.findall('.//alertitem'):
        name_el = item.find('name')
        alert_el = item.find('alert')
        name = (name_el.text or '').strip() if name_el is not None else ''
        name = name or (alert_el.text or '').strip() if alert_el is not None else ''

        riskcode = (item.find('riskcode').text or '').strip() if item.find('riskcode') is not None else ''
        riskdesc = (item.find('riskdesc').text or '').strip() if item.find('riskdesc') is not None else ''
        pluginid = (item.find('pluginid').text or '').strip() if item.find('pluginid') is not None else ''
        alertref = (item.find('alertRef').text or '').strip() if item.find('alertRef') is not None else ''
        cweid = (item.find('cweid').text or '').strip() if item.find('cweid') is not None else ''
        count_el = item.find('count')
        count = int(count_el.text) if count_el is not None and count_el.text and count_el.text.isdigit() else 0
        desc_el = item.find('desc')
        description = (desc_el.text or '').strip()[:500] if desc_el is not None else ''
        solution_el = item.find('solution')
        solution = (solution_el.text or '').strip()[:500] if solution_el is not None else ''

        risk = riskdesc.lower().split(' ')[0].strip('()') if riskdesc else ''
        conf_map = {'0': 'False Positive', '1': 'Low', '2': 'Medium', '3': 'High', '4': 'Confirmed'}
        confidence = (item.find('confidence').text or '').strip() if item.find('confidence') is not None else ''

        instances = []
        for inst in item.findall('./instances/instance'):
            uri_el = inst.find('uri')
            param_el = inst.find('param')
            method_el = inst.find('method')
            evidence_el = inst.find('evidence')
            attack_el = inst.find('attack')
            instances.append({
                'uri': (uri_el.text or '').strip() if uri_el is not None else '',
                'param': (param_el.text or '').strip() if param_el is not None else '',
                'method': (method_el.text or '').strip() if method_el is not None else '',
                'evidence': ((evidence_el.text or '').strip())[:300] if evidence_el is not None else '',
                'attack': ((attack_el.text or '').strip())[:300] if attack_el is not None else '',
            })

        alerts.append({
            'name': name,
            'risk': risk,
            'riskcode': riskcode,
            'confidence': confidence,
            'pluginid': pluginid,
            'alertRef': alertref,
            'cwe': cweid,
            'count': count,
            'description': description,
            'solution': solution,
            'site': site_name,
            'instances': instances,
        })

out_path = os.path.join(BASE, 'zap_raw_alerts_from_xml.json')
with open(out_path, 'w', encoding='utf-8') as f:
    json.dump({'alerts': alerts, 'count': len(alerts), 'source': 'xml_parse'}, f, ensure_ascii=False, indent=2)

# Stats
from core.finding_collapse import collapse_findings
collapse = collapse_findings(alerts)

print(f'Alerts from XML: {len(alerts)}')
print(f'Collapsed clusters: {len(collapse.clusters)}')
print(f'Systemic: {collapse.systemic_clusters}')
print(f'Totals: {collapse.totals}')
for c in collapse.clusters:
    print(f'  [{c.severity}] {c.title} x{c.instance_count} {"SYSTEMIC" if c.systemic else ""}')
print(f'\nSaved to: {out_path}')