# -*- coding: utf-8 -*-
"""PW-6: Unified actions/probes layer for Playwright.

Single contract for all browser automation consumers:
  - Discovery Engine (PW-4/PW-5)
  - Regression tests
  - CDP-driver agent
  - Fuzzing / Intruder

Actions (mutable, may change page state):
  from actions.actions import (
      action_navigate, action_click, action_click_text, action_click_role,
      action_fill, action_fill_label, action_submit,
      action_wait_selector, action_wait_url, action_wait_timeout,
      action_press_key, action_reload, action_auth_http_basic,
  )

Probes (read-only, never mutate state):
  from actions.probes import (
      probe_url, probe_title, probe_heading, probe_state,
      probe_ax, probe_network_traffic,
      probe_element_exists, probe_element_count, probe_text_visible,
      probe_screenshot,
  )
"""
from actions.actions import (  # noqa: F401
    action_auth_http_basic,
    action_click,
    action_click_role,
    action_click_text,
    action_fill,
    action_fill_label,
    action_navigate,
    action_press_key,
    action_reload,
    action_submit,
    action_wait_selector,
    action_wait_timeout,
    action_wait_url,
)
from actions.probes import (  # noqa: F401
    probe_ax,
    probe_element_count,
    probe_element_exists,
    probe_heading,
    probe_network_traffic,
    probe_screenshot,
    probe_state,
    probe_text_visible,
    probe_title,
    probe_url,
)