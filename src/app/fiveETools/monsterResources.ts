import { isHitPointsKey, parseResourceValue } from '../resources/resourceFields';
import type { ResourceDefinition, ResourceValue } from '../resources/resourceTypes';
import type { FiveEMonster } from './types';

/**
 * Starting resource values from a 5e.tools monster for the collection's
 * definitions (HP only in the MVP).
 */
export function monsterResources(
  monster: FiveEMonster,
  definitions: readonly ResourceDefinition[],
): Record<string, ResourceValue> {
  if (!monster.hp.trim()) return {};
  const values: Record<string, ResourceValue> = {};
  for (const definition of definitions) {
    if (!isHitPointsKey(definition.key) && !isHitPointsKey(definition.field)) continue;
    const parsed = parseResourceValue(monster.hp, definition.direction === 'fills');
    if (parsed) values[definition.key] = parsed;
  }
  return values;
}
