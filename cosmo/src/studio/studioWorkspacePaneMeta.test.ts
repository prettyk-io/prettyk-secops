import { describe, expect, it } from 'vitest';
import { prettyPaneLabelKind, resourceLanguageFromPath } from './studioWorkspacePaneMeta';

describe('studioWorkspacePaneMeta', () => {
  it('picks label for panes', () => {
    expect(prettyPaneLabelKind({ isResourceTab: true, isFuzzerTab: false })).toBe('resource');
    expect(prettyPaneLabelKind({ isResourceTab: false, isFuzzerTab: true })).toBe('fuzzer');
    expect(
      prettyPaneLabelKind({
        isResourceTab: false,
        isFuzzerTab: false,
        isConnectorTab: true,
      }),
    ).toBe('connector');
    expect(prettyPaneLabelKind({ isResourceTab: false, isFuzzerTab: false })).toBe('prettyk');
  });

  it('determines syntax language for resource extensions', () => {
    expect(resourceLanguageFromPath('resources/users.json')).toBe('json');
    expect(resourceLanguageFromPath('resources/traffic.har')).toBe('json');
    expect(resourceLanguageFromPath('resources/config.properties')).toBe('ini');
    expect(resourceLanguageFromPath('resources/.env')).toBe('ini');
    expect(resourceLanguageFromPath('resources/api.proto')).toBe('proto');
    expect(resourceLanguageFromPath('resources/spec.yaml')).toBe('yaml');
    expect(resourceLanguageFromPath('resources/schema.graphql')).toBe('graphql');
    expect(resourceLanguageFromPath('resources/wordlist.txt')).toBe('plaintext');
  });
});
