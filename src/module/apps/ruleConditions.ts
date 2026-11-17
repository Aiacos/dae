import { i18n } from "../../dae.js";

/*
 * dnd5e 6.1's rule changes (advantage, bonus, minimum, maximum, damage application options) check their conditions
 * at each roll, against that roll's data, not against the actor when it is prepared. These are the fields dnd5e adds
 * to the roll data for each rule key (`roll.*`, checked on the 6.1 test world), and sample rolls to test against.
 */

export const RULE_CHANGE_TYPES: ReadonlySet<string> = new Set([
  "dnd5e.advantage", "dnd5e.bonus", "dnd5e.minimum", "dnd5e.maximum",
  "dnd5e.damage.downgrade", "dnd5e.damage.ignore.immunity", "dnd5e.damage.ignore.resistance", "dnd5e.damage.ignore.vulnerability"
]);

export function isRuleChangeType(type: string | undefined): boolean {
  return !!type && RULE_CHANGE_TYPES.has(type)
    && type in ((ActiveEffect as unknown as ActiveEffectStatic).CHANGE_TYPES ?? {});
}

const D20_KEYS: ReadonlySet<string> = new Set(["d20", "attack", "check", "save"]);
const CHECK_KEYS: ReadonlySet<string> = new Set(["d20", "check"]);
const ATTACK_KEYS: ReadonlySet<string> = new Set(["d20", "attack", "damage"]);
const ITEM_KEYS: ReadonlySet<string> = new Set(["attack", "damage", "healing"]);

/** The `roll.type` values a rule key's rolls have. */
const ROLL_TYPES: Record<string, string[]> = {
  attack: ["attack"],
  check: ["ability", "skill", "tool", "initiative"],
  save: ["ability", "concentration", "death"],
};
ROLL_TYPES.d20 = [...new Set([...ROLL_TYPES.attack, ...ROLL_TYPES.check, ...ROLL_TYPES.save])];

export interface RuleField { key: string; op: "exact" | "has"; label: string }

/** dnd5e checks its damage application rules (ignore, downgrade) once for the roll, before any part has a damage type. */
const isApplicationRule = (ruleType: string | undefined): boolean => !!ruleType?.startsWith("dnd5e.damage.");

/** The roll's own fields for a rule key (and change type), for the builder's field menu. */
export function ruleFields(ruleKey: string, ruleType?: string): RuleField[] {
  const field = (key: string, op: RuleField["op"], id: string): RuleField => ({ key, op, label: i18n(`dae.ConditionBuilder.RuleField.${id}`) });
  const fields: RuleField[] = [];
  if (D20_KEYS.has(ruleKey)) fields.push(field("roll.type", "exact", "type"));
  if (D20_KEYS.has(ruleKey) || ATTACK_KEYS.has(ruleKey)) fields.push(field("roll.ability", "exact", "ability"));
  if (D20_KEYS.has(ruleKey)) fields.push(field("roll.proficient", "exact", "proficient"));
  if (CHECK_KEYS.has(ruleKey)) fields.push(field("roll.skill", "exact", "skill"), field("roll.tool", "exact", "tool"));
  if (ATTACK_KEYS.has(ruleKey)) fields.push(
    field("roll.attack.type", "exact", "attackType"),
    field("roll.attack.classification", "exact", "attackClassification"),
    field("roll.attack.mode", "exact", "attackMode"));
  // A healing roll's data has only the part's type
  if ((ruleKey === "damage" && !isApplicationRule(ruleType)) || ruleKey === "healing") fields.push(field("roll.damage.type", "exact", "damageType"));
  if (ruleKey === "damage") fields.push(field("roll.properties", "has", "properties"), field("roll.isCritical", "exact", "isCritical"));
  return fields;
}

/** Whether the rule's rolls carry the rolled item's data (`item.*`). */
export function ruleHasItem(ruleKey: string): boolean {
  return ITEM_KEYS.has(ruleKey);
}

export function labels(config: Record<string, { label?: string; name?: string } | string>): Record<string, string> {
  return Object.fromEntries(Object.entries(config).map(([id, entry]) =>
    [id, i18n(typeof entry === "string" ? entry : entry.label ?? entry.name ?? id)]));
}

function toolLabel(id: string): string {
  return globalThis.dnd5e?.documents?.Trait?.keyLabel?.(`tool:${id}`) ?? id;
}

/** Value lists for the roll's fields, so the value is picked rather than typed. */
export function ruleChoices(ruleKey: string): Record<string, () => Record<string, string>> {
  const yesNo = () => ({ true: i18n("Yes"), false: i18n("No") });
  return {
    "roll.type": () => Object.fromEntries((ROLL_TYPES[ruleKey] ?? ROLL_TYPES.d20)
      .map(type => [type, i18n(`dae.ConditionBuilder.RollType.${type}`)])),
    "roll.ability": () => labels(CONFIG.DND5E.abilities),
    "roll.proficient": yesNo,
    "roll.isCritical": yesNo,
    "roll.skill": () => labels(CONFIG.DND5E.skills),
    "roll.tool": () => Object.fromEntries(Object.keys(CONFIG.DND5E.tools ?? {}).map(id => [id, toolLabel(id)])),
    "roll.attack.type": () => labels(CONFIG.DND5E.attackTypes ?? {}),
    "roll.attack.classification": () => labels(CONFIG.DND5E.attackClassifications ?? {}),
    "roll.attack.mode": () => labels(CONFIG.DND5E.attackModes ?? {}),
    "roll.damage.type": () => ruleKey === "healing" ? labels(CONFIG.DND5E.healingTypes) : labels(CONFIG.DND5E.damageTypes),
    "roll.properties": () => labels(CONFIG.DND5E.itemProperties),
  };
}

export interface SampleRoll { id: string; group: string; label: string; data: () => Record<string, unknown> }

type Prof = { prof?: { multiplier?: number } } | undefined;
const proficient = (entry: Prof): boolean => (entry?.prof?.multiplier ?? 0) >= 1;

type Rolled = { ability?: string } & NonNullable<Prof>;
/** The dnd5e actor data the sample rolls read: the one place it is read untyped */
function actorData(actor: Actor.Implementation): {
  abilities?: Record<string, { check?: Prof; save?: Prof }>; skills?: Record<string, Rolled>; tools?: Record<string, Rolled>;
  attributes?: { init?: Rolled; concentration?: { ability?: string } };
} {
  // @ts-expect-error no dnd5e types
  return actor.system;
}

interface SampleActivity {
  type: string; name?: string; uuid: string;
  damage?: { parts?: { types?: Set<string> }[]; includeBase?: boolean };
  healing?: { types?: Set<string> };
  getRollData(options: { roll: Record<string, unknown> }): Record<string, unknown>;
}
/** The dnd5e item data the sample rolls read: the one place it is read untyped */
function itemData(item: Item.Implementation): { activities?: Iterable<SampleActivity>; properties?: Set<string>; damage?: { base?: { types?: Set<string> } } } {
  // @ts-expect-error no dnd5e types
  return item.system;
}

/** The data a rule condition is checked against: the roll data, and the effect's own item (`sourceItem`). */
function conditionData(effect: ActiveEffect.Implementation, rollData: Record<string, unknown>): Record<string, unknown> {
  return effect.getRuleConditionData?.(rollData) ?? rollData;
}

/**
 * Rolls of the effect's actor that a rule with this key applies to, each building its condition data as dnd5e does
 * when it makes the roll. None for an effect with no actor.
 */
export function sampleRolls(effect: ActiveEffect.Implementation, ruleKey: string, ruleType?: string): SampleRoll[] {
  const parent = effect.parent;
  const actor = parent instanceof Actor ? parent : parent instanceof Item ? parent.actor : null;
  if (!actor) return [];
  const system = actorData(actor);
  const abilities = system.abilities ?? {};
  const skills = system.skills ?? {};
  const tools = system.tools ?? {};
  const init = system.attributes?.init;
  const concentrationAbility = system.attributes?.concentration?.ability;
  const defaults = CONFIG.DND5E.defaultAbilities ?? {};
  const abilityLabels = labels(CONFIG.DND5E.abilities);
  const skillLabels = labels(CONFIG.DND5E.skills);
  const samples: SampleRoll[] = [];
  const actorRoll = (id: string, group: string, label: string, roll: Record<string, unknown>) => samples.push({
    id, group, label,
    data: () => conditionData(effect, { ...actor.getRollData(), roll: { ...roll } })
  });

  if (ruleKey === "attack" || ruleKey === "d20" || ruleKey === "damage" || ruleKey === "healing") {
    for (const item of actor.items) {
      const data = itemData(item);
      for (const activity of data.activities ?? []) {
        const attack = activity.type === "attack";
        const heal = activity.type === "heal";
        const damages = !heal && ((activity.damage?.parts?.length ?? 0) > 0 || (attack && !!activity.damage?.includeBase));
        if (ruleKey === "healing" ? !heal : ruleKey === "damage" ? !damages : !attack) continue;
        const label = activity.name && activity.name !== item.name ? `${item.name}: ${activity.name}` : item.name;
        const group = i18n(`dae.ConditionBuilder.Sample.${ruleKey === "d20" ? "attack" : ruleKey}`);
        samples.push({
          id: activity.uuid, group, label: label ?? "",
          data: () => {
            const rollData: Record<string, unknown> = activity.getRollData({ roll: { ability: undefined, attackMode: undefined } });
            const roll: Record<string, unknown> = Object.assign({}, rollData.roll);
            rollData.roll = roll;
            if (ruleKey === "damage") {
              // As dnd5e's getDamageConfig: the item's physical properties
              roll.isCritical = false;
              roll.properties = Array.from(data.properties ?? []).filter(p => CONFIG.DND5E.itemProperties[p]?.isPhysical);
            }
            if ((ruleKey === "damage" && !isApplicationRule(ruleType)) || ruleKey === "healing") {
              // Each part's type in turn (the first here)
              const partTypes = activity.damage?.parts?.[0]?.types;
              const types = heal ? activity.healing?.types : partTypes?.size ? partTypes : data.damage?.base?.types;
              roll.damage = { type: types?.first() ?? null };
            }
            return conditionData(effect, rollData);
          }
        });
      }
    }
  }
  if (CHECK_KEYS.has(ruleKey)) {
    const group = i18n("dae.ConditionBuilder.Sample.check");
    for (const [id, label] of Object.entries(abilityLabels)) {
      actorRoll(`check-${id}`, group, label, { ability: id, proficient: proficient(abilities[id]?.check), type: "ability" });
    }
    const skillGroup = i18n("dae.ConditionBuilder.Sample.skill");
    for (const [id, skill] of Object.entries(skills)) {
      actorRoll(`skill-${id}`, skillGroup, skillLabels[id] ?? id, { ability: skill.ability, proficient: proficient(skill), skill: id, type: "skill" });
    }
    const toolGroup = i18n("dae.ConditionBuilder.Sample.tool");
    for (const [id, tool] of Object.entries(tools)) {
      actorRoll(`tool-${id}`, toolGroup, toolLabel(id), { ability: tool.ability, proficient: proficient(tool), tool: id, type: "tool" });
    }
    actorRoll("initiative", group, i18n("dae.ConditionBuilder.RollType.initiative"),
      { ability: init?.ability || defaults.initiative, proficient: proficient(init), type: "initiative" });
  }
  if (ruleKey === "save" || ruleKey === "d20") {
    const group = i18n("dae.ConditionBuilder.Sample.save");
    for (const [id, label] of Object.entries(abilityLabels)) {
      actorRoll(`save-${id}`, group, label, { ability: id, proficient: proficient(abilities[id]?.save), type: "ability" });
    }
    const ability = concentrationAbility || defaults.concentration;
    actorRoll("concentration", group, i18n("dae.ConditionBuilder.RollType.concentration"),
      { ability, proficient: proficient(ability ? abilities[ability]?.save : undefined), type: "concentration" });
    actorRoll("death", group, i18n("dae.ConditionBuilder.RollType.death"), { ability: undefined, proficient: false, type: "death" });
  }
  return samples;
}

/** dnd5e's advantage rule values, by what they do. */
export function advantageRuleOptions(): Record<string, string> {
  return Object.fromEntries(["1", "-1", "=1", "=-1", ">=0", "<=0"].map(value => [value, i18n(`dae.RuleValue.Advantage.${value}`)]));
}
