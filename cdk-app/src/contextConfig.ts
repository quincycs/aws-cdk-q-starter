export interface ContextConfigProps {
  envName: string;
  computeName: string;
  computeDNS: string;
}

let context: ContextConfigProps;

export function setContext(config: ContextConfigProps) {
  context = config;
}

export function getContext(): ContextConfigProps {
  return context;
}