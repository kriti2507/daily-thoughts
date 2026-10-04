export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function optionalEnv(name: string, fallback: string): string {
  return process.env[name] || fallback;
}

export function optionalNumberEnv(name: string, fallback: number): number {
  return process.env[name] ? requireNumberEnv(name) : fallback;
}

export function requireNumberEnv(name: string): number {
  const value = Number(requireEnv(name));
  if (!Number.isFinite(value)) {
    throw new Error(`Environment variable must be a number: ${name}`);
  }
  return value;
}
