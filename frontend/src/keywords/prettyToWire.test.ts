import { describe, expect, it } from 'vitest';
import {
  hasBarePrettyArg,
  isBadSecretRhs,
  isBarePrettyArg,
  prettyTextToWire,
  resolveCall,
  resolvePrettyDataLine,
  splitPrettyArgs,
} from './prettyToWire';

const S1_PRETTY = `Пусть $username = СлучайныйEmail
Пусть $password_value = "pk_password"
Пусть $security_answer = "pk"
Пусть $run_id = UUID
Пусть $stamp = Сейчас "%d.%m %H:%M"
Пусть $search_q = "Permafrost"
Лог "прогон $run_id / $stamp, user $username"`;

const S1_WIRE = `core|generate_random_email → username
data|let|password_value|"pk_password"
data|let|security_answer|"pk"
core|generate_uuid → run_id
core|current_datetime|%d.%m %H:%M → stamp
data|let|search_q|"Permafrost"
core|log_message|прогон $run_id / $stamp, user $username`;

describe('prettyToWire', () => {
  it('Открыть $path', () => {
    expect(prettyTextToWire('Открыть $path')).toBe('webdriver|open|$path');
    expect(resolveCall('Открыть /#/login')).toBe('webdriver|open|/#/login');
  });

  it('facade scanner', () => {
    expect(resolveCall('Сканер $base')).toBe('scanner|spider_scan|$base');
  });

  it('language leaves', () => {
    const src = 'Если $status 200 {\n  Открыть $url\n}';
    expect(prettyTextToWire(src)).toBe(
      'Если $status 200 {\n  webdriver|open|$url\n}',
    );
  });

  it('splitPrettyArgs: $base/path одним токеном', () => {
    expect(splitPrettyArgs('$base_url/#/login')).toEqual(['$base_url/#/login']);
    expect(splitPrettyArgs('${base_url}/#/login')).toEqual(['${base_url}/#/login']);
  });

  it('Пусть $name', () => {
    expect(resolvePrettyDataLine('Пусть $role = "admin"')).toBe(
      'data|let|role|"admin"',
    );
    expect(resolvePrettyDataLine('Пусть $email = СлучайныйEmail')).toBe(
      'core|generate_random_email → email',
    );
    expect(resolvePrettyDataLine('Пусть ${id} = UUID')).toBe('core|generate_uuid → id');
    expect(resolvePrettyDataLine('Пусть $d = Сейчас "%d.%m.%Y"')).toBe(
      'core|current_datetime|%d.%m.%Y → d',
    );
  });

  it('Секрет: только кавычки / $ref; value и склейка — нет', () => {
    expect(isBadSecretRhs('')).toBe(true);
    expect(isBadSecretRhs('value')).toBe(true);
    expect(isBadSecretRhs('valueПусть $password_value = "pk_password"')).toBe(true);
    expect(isBadSecretRhs('"pk_password"')).toBe(false);
    expect(isBadSecretRhs('$password_value')).toBe(false);
    expect(
      resolvePrettyDataLine('Секрет $name = valueПусть $password_value = "x"'),
    ).toBeUndefined();
    expect(resolvePrettyDataLine('Секрет $password_value = "pk_password"')).toBe(
      'data|secret|password_value|"pk_password"',
    );
  });

  it('$ref vs кавычки vs голое имя', () => {
    expect(isBarePrettyArg('data_module')).toBe(true);
    expect(isBarePrettyArg('$data_module')).toBe(false);
    expect(isBarePrettyArg('"data_module"')).toBe(false);
    expect(isBarePrettyArg('42')).toBe(false);
    expect(hasBarePrettyArg('a "/x"')).toBe(true);
    expect(hasBarePrettyArg('$a "/x"')).toBe(false);
    expect(hasBarePrettyArg('"$notavar" "ok"')).toBe(false);
  });

  it('juice s1 pretty → wire', () => {
    expect(prettyTextToWire(S1_PRETTY)).toBe(S1_WIRE);
  });

  it('ВставитьЗначение email $username', () => {
    expect(resolveCall('ВставитьЗначение email $username')).toBe(
      'webdriver|send_keys|email|$username',
    );
  });
});
