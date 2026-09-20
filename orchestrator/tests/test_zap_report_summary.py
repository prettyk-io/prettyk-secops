# -*- coding: utf-8 -*-
from __future__ import annotations

from pathlib import Path

from utils.zap_report_summary import summarize_scanner_xml

_SAMPLE_XML = """<?xml version="1.0"?>
<OWASPscannerReport version="2.14.0" generated="Mon, 10 Aug 2026 12:00:00">
  <site name="http://127.0.0.1:3000" host="127.0.0.1" port="3000" ssl="false">
    <alerts>
      <alertitem>
        <pluginid>40018</pluginid>
        <alertRef>40018</alertRef>
        <alert>SQL Injection</alert>
        <name>SQL Injection</name>
        <riskcode>3</riskcode>
        <riskdesc>High (High)</riskdesc>
        <cweid>89</cweid>
        <count>2</count>
        <instances>
          <instance>
            <uri>http://127.0.0.1:3000/rest/products/search</uri>
            <param>q</param>
          </instance>
          <instance>
            <uri>http://127.0.0.1:3000/rest/user/login</uri>
            <param>email</param>
          </instance>
        </instances>
      </alertitem>
      <alertitem>
        <pluginid>10020</pluginid>
        <alertRef>10020-1</alertRef>
        <alert>Missing Anti-clickjacking Header</alert>
        <name>Missing Anti-clickjacking Header</name>
        <riskcode>1</riskcode>
        <riskdesc>Low (Medium)</riskdesc>
        <cweid>1021</cweid>
        <count>5</count>
        <instances>
          <instance><uri>http://127.0.0.1:3000/</uri></instance>
          <instance><uri>http://127.0.0.1:3000/login</uri></instance>
          <instance><uri>http://127.0.0.1:3000/about</uri></instance>
          <instance><uri>http://127.0.0.1:3000/basket</uri></instance>
          <instance><uri>http://127.0.0.1:3000/search</uri></instance>
        </instances>
      </alertitem>
    </alerts>
  </site>
</OWASPscannerReport>
"""


def test_summarize_scanner_xml_counts_and_collapse(tmp_path: Path):
    xml = tmp_path / "scanner.xml"
    xml.write_text(_SAMPLE_XML, encoding="utf-8")
    out = summarize_scanner_xml(xml)
    assert out["ok"] is True
    assert out["sites"] == 1
    assert out["alert_count"] == 2
    assert out["instance_count"] == 7
    assert out["counts"]["high"] == 1
    assert out["counts"]["low"] == 1
    assert out["instance_counts"]["high"] == 2
    assert out["instance_counts"]["low"] == 5
    assert out["top_findings"][0]["name"] == "SQL Injection"
    assert out["collapse"] is not None
    assert out["collapse"]["raw_count"] == 7
    # Header alert collapses to one systemic cluster
    systemic = [
        c for c in out["collapse"]["clusters"] if c.get("systemic")
    ]
    assert len(systemic) >= 1


def test_summarize_scanner_xml_missing(tmp_path: Path):
    out = summarize_scanner_xml(tmp_path / "nope.xml")
    assert out["ok"] is False
    assert out["error"] == "missing"
