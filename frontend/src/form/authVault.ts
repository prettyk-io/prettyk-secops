/**
 * AUTH-3: Утилиты и типы для Auth-Chain Vault (контекст сессии и маппинг токенов на фронте).
 */

export interface AuthExtractRuleUI {
  targetVar: string; // e.g. "auth.token"
  source: 'body_json' | 'header' | 'cookie' | 'body_raw';
  path: string; // e.g. "access_token" or "data.jwt"
  regex?: string;
}

export interface AuthProfileUI {
  name: string;
  authType: 'bearer' | 'cookie' | 'api_key' | 'basic' | 'custom';
  loginUrl: string;
  method: 'GET' | 'POST' | 'PUT';
  headers?: Record<string, string>;
  body?: string;
  extractRules: AuthExtractRuleUI[];
}

/** Извлекает значение из JSON-объекта по точечному пути (data.access_token). */
export function extractValueByJsonPath(data: any, path: string): any {
  if (!path || !data) return data;
  const parts = path.split('.');
  let curr = data;
  for (const p of parts) {
    if (curr && typeof curr === 'object' && p in curr) {
      curr = curr[p];
    } else {
      return undefined;
    }
  }
  return curr;
}

/** Извлекает токены из фиктивного/реального ответа по правилам экстракции. */
export function extractAuthTokens(
  responseBody: string,
  responseHeaders: Record<string, string>,
  rules: AuthExtractRuleUI[]
): Record<string, any> {
  const tokens: Record<string, any> = {};
  let jsonData: any = null;
  try {
    jsonData = JSON.parse(responseBody);
  } catch {
    jsonData = null;
  }

  for (const rule of rules) {
    let val: any = undefined;
    if (rule.source === 'body_json' && jsonData) {
      val = extractValueByJsonPath(jsonData, rule.path);
    } else if (rule.source === 'header') {
      const hKey = Object.keys(responseHeaders).find(
        (k) => k.toLowerCase() === rule.path.toLowerCase()
      );
      if (hKey) val = responseHeaders[hKey];
    } else if (rule.source === 'cookie') {
      const setCookie = responseHeaders['set-cookie'] || responseHeaders['Set-Cookie'] || '';
      if (rule.path) {
        const re = new RegExp(`${rule.path}=([^;]+)`);
        const m = setCookie.match(re);
        if (m) val = m[1];
      } else {
        val = setCookie;
      }
    } else if (rule.source === 'body_raw') {
      val = responseBody;
    }

    if (val !== undefined && rule.regex) {
      try {
        const re = new RegExp(rule.regex);
        const m = String(val).match(re);
        if (m) val = m[1] ?? m[0];
      } catch {
        // regex error fallback
      }
    }

    if (val !== undefined) {
      tokens[rule.targetVar] = val;
    }
  }

  return tokens;
}
