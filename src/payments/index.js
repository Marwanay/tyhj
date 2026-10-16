// Provider registry. The active provider is chosen with PAYMENT_PROVIDER; credentials
// come from the environment only. Adding another Egyptian gateway (e.g. Kashier,
// Geidea, Fawry) means adding a module with the same four methods.
import { config } from '../config.js';
import { paymob } from './paymob.js';
import { sandbox } from './sandbox.js';

const providers = { paymob, sandbox };

export function getProvider(name = config.payments.provider) {
  const p = providers[name];
  if (!p) throw new Error(`Unknown payment provider "${name}"`);
  return p;
}

export function activeProviderStatus() {
  const p = providers[config.payments.provider];
  if (!p) return { provider: config.payments.provider, label: config.payments.provider, mode: config.payments.mode, ready: false, missing: [], problems: [`Unknown provider "${config.payments.provider}"`] };
  return { provider: p.name, label: p.label, mode: config.payments.mode, ...p.status() };
}

export const knownProviders = () => Object.values(providers).map(p => ({ name: p.name, label: p.label }));
