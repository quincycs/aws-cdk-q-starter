export interface ContextConfigProps {
  envName: string;
  computeDNS: string;
}

let context: ContextConfigProps;

export function setContext(config: ContextConfigProps) {
  context = config;
}

export function getContext(): ContextConfigProps {
  return context;
}