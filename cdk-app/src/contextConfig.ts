export interface ContextConfigProps {
  envName: string;
  computeName: string;
}

let context: ContextConfigProps;

export function setContext(config: ContextConfigProps) {
  context = config;
}

export function getContext(): ContextConfigProps {
  return context;
}