export type MachineTransition<S extends string, E extends string> = {
  target: S;
  guard?: () => boolean;
};

export type MachineStateDef<S extends string, E extends string> = {
  onEnter?: () => void;
  onLeave?: () => void;
  transitions?: Partial<Record<E, MachineTransition<S, E>>>;
};

export type MachineDef<S extends string, E extends string> = {
  initial: S;
  states: Record<S, MachineStateDef<S, E>>;
};

export type MachineInstance<S extends string, E extends string> = {
  getState: () => S;
  can: (event: E) => boolean;
  send: (event: E, bypassGuard?: boolean) => boolean;
};

export function createMachine<S extends string, E extends string>(
  def: MachineDef<S, E>,
): MachineInstance<S, E> {
  let current: S = def.initial;

  const getState = (): S => current;

  const can = (event: E): boolean => {
    const stateDef = def.states[current];
    const transition = stateDef.transitions?.[event];
    if (!transition) return false;
    if (transition.guard && !transition.guard()) return false;
    return true;
  };

  const send = (event: E, bypassGuard = false): boolean => {
    const stateDef = def.states[current];
    const transition = stateDef.transitions?.[event];
    if (!transition) return false;
    if (!bypassGuard && transition.guard && !transition.guard()) return false;

    stateDef.onLeave?.();
    current = transition.target;
    def.states[current].onEnter?.();

    return true;
  };

  return { getState, can, send };
}
