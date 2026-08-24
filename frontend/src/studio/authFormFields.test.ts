import { describe, expect, it } from 'vitest';
import {
  defaultAuthActionFields,
  defaultAuthFormFields,
  isAuthActionConstructor,
  isAuthFormConstructor,
  parseAuthActionConstructor,
  parseAuthFormConstructor,
  serializeAuthActionConstructor,
  serializeAuthFormConstructor,
  updateAuthModuleConstructor,
} from './authFormFields';
import { addAuthModule } from './studioModules';

describe('authFormFields AUTH-14C', () => {
  it('detects auth=form dialect', () => {
    expect(isAuthFormConstructor('auth=form\nlogin_url=https://x\n')).toBe(true);
    expect(isAuthFormConstructor('auth=bearer\ntoken=t\n')).toBe(false);
  });

  it('round-trips type+value locators without SoT rewrite', () => {
    const fields = defaultAuthFormFields({
      login_url: 'https://app/login',
      login: 'u1',
      password: 'sekret',
      user_type: 'css',
      user_value: 'input[name=email]',
      pass_type: 'id',
      pass_value: 'password',
      submit_type: 'xpath',
      submit_value: '//button',
      form_type: 'name',
      form_value: 'login',
      success_string: 'Logout',
    });
    const text = serializeAuthFormConstructor(fields);
    expect(text).toContain('auth=form');
    expect(text).toContain('user_locator=css input[name=email]');
    expect(text).toContain('pass_locator=id password');
    expect(text).toContain('submit_locator=xpath //button');
    expect(text).toContain('form_locator=name login');
    expect(text).toContain('#password=sekret');
    const back = parseAuthFormConstructor(text);
    expect(back.user_type).toBe('css');
    expect(back.user_value).toBe('input[name=email]');
    expect(back.pass_type).toBe('id');
    expect(back.password).toBe('sekret');
    expect(back.success_string).toBe('Logout');
  });

  it('action MFA round-trip type+value + totp', () => {
    const fields = defaultAuthActionFields({
      login_url: 'https://idp/login',
      login: 'u1',
      password: 'sekret',
      user_type: 'css',
      user_value: '#email',
      pass_type: 'id',
      pass_value: 'password',
      submit_type: 'css',
      submit_value: 'button',
      mfa: 'totp',
      totp_secret: 'JBSWY3DPEHPK3PXP',
      otp_type: 'css',
      otp_value: 'input[name=otp]',
      otp_submit_type: 'css',
      otp_submit_value: 'button.continue',
      success_string: 'Logout',
    });
    const text = serializeAuthActionConstructor(fields);
    expect(isAuthActionConstructor(text)).toBe(true);
    expect(text).toContain('mfa=totp');
    expect(text).toContain('#totp_secret=JBSWY3DPEHPK3PXP');
    expect(text).toContain('otp_locator=css input[name=otp]');
    const back = parseAuthActionConstructor(text);
    expect(back.mfa).toBe('totp');
    expect(back.totp_secret).toBe('JBSWY3DPEHPK3PXP');
    expect(back.otp_type).toBe('css');
  });

  it('updateAuthModuleConstructor writes auth_fields.constructor', () => {
    const created = addAuthModule({}, 'login_form');
    expect(created).toBeTruthy();
    const text = serializeAuthFormConstructor(
      defaultAuthFormFields({
        login_url: 'https://app/login',
        user_type: 'css',
        user_value: '#email',
        pass_type: 'id',
        pass_value: 'password',
        submit_type: 'css',
        submit_value: 'button',
      }),
    );
    const next = updateAuthModuleConstructor(created, 0, text);
    const mod = (next as { test_suites: { test_data_constructor: Array<{ auth_fields: { constructor: string } }> } })
      .test_suites.test_data_constructor[0];
    if (!mod) throw new Error('no module');
    expect(isAuthFormConstructor(mod.auth_fields.constructor)).toBe(true);
    expect(mod.auth_fields.constructor).toContain('user_locator=css #email');
  });
});
