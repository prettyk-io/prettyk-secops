import { describe, expect, it } from 'vitest';
import {
  buildActionFormPayload,
  validateActionFormDraft,
} from './studioActionFormSubmit';

describe('studioActionFormSubmit', () => {
  it('requires name', () => {
    expect(
      validateActionFormDraft({
        actionId: 'create-module',
        name: '  ',
        resourceKind: 'data_file',
        protoAs: '',
        specMode: 'url_relative',
        specAs: '',
        specPathRel: '/openapi.json',
        schemaMode: 'introspection_relative',
        sdlAs: '',
        schemaPathRel: '/graphql',
        endpointRel: '/graphql',
        authModuleId: '',
        protoOptionsLen: 0,
        openApiOptionsLen: 0,
        gqlOptionsLen: 0,
      }),
    ).toBe('Укажите идентификатор');
  });

  it('builds openapi url payload', () => {
    const payload = buildActionFormPayload(
      {
        actionId: 'create-openapi',
        name: 'bank',
        resourceKind: 'data_file',
        protoAs: '',
        specMode: 'url_relative',
        specAs: '',
        specPathRel: '/oas.json',
        schemaMode: 'introspection_relative',
        sdlAs: '',
        schemaPathRel: '/graphql',
        endpointRel: '/graphql',
        authModuleId: 'auth1',
        protoOptionsLen: 0,
        openApiOptionsLen: 1,
        gqlOptionsLen: 0,
      },
      { includeFolder: false },
    );
    expect(payload.specPathRel).toBe('/oas.json');
    expect(payload.authModuleId).toBe('auth1');
  });
});
