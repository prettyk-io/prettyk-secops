/**
 * Human-readable snake_case → "Snake case" for auto-generated descriptions.
 * "login_flow" → "Login flow", "my_cool_scenario" → "My cool scenario"
 */
export function humanizeSnakeCase(snake: string): string {
  return snake
    .split('_')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}