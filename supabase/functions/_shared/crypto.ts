/**
 * Cifrado simétrico de credenciales (AES-256-GCM) para los tokens OAuth de los comercios.
 *
 * La clave vive SOLO como secreto de las Edge Functions:
 *   supabase secrets set MP_TOKEN_ENC_KEY=$(openssl rand -base64 32)
 *
 * Formato guardado en la base: `v1:<iv base64>:<ciphertext+tag base64>`.
 * El prefijo de versión permite rotar el esquema sin romper filas viejas.
 */

const VERSION = 'v1';
let cachedKey: CryptoKey | null = null;

function toBase64(bytes: Uint8Array) {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function getKey(): Promise<CryptoKey> {
  if (cachedKey) return cachedKey;
  const raw = Deno.env.get('MP_TOKEN_ENC_KEY') || '';
  if (!raw) throw new Error('MP_TOKEN_ENC_KEY no está configurado');
  let bytes: Uint8Array<ArrayBuffer>;
  try {
    bytes = fromBase64(raw.trim());
  } catch {
    throw new Error('MP_TOKEN_ENC_KEY debe estar en base64');
  }
  if (bytes.length !== 32) throw new Error('MP_TOKEN_ENC_KEY debe tener 32 bytes (AES-256)');
  cachedKey = await crypto.subtle.importKey('raw', bytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  return cachedKey;
}

export function encryptionConfigured() {
  return Boolean(Deno.env.get('MP_TOKEN_ENC_KEY'));
}

export async function encryptToken(plain: string | null | undefined): Promise<string | null> {
  if (!plain) return null;
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plain));
  return `${VERSION}:${toBase64(iv)}:${toBase64(new Uint8Array(cipher))}`;
}

export async function decryptToken(stored: string | null | undefined): Promise<string | null> {
  if (!stored) return null;
  const [version, ivB64, dataB64] = String(stored).split(':');
  if (version !== VERSION || !ivB64 || !dataB64) throw new Error('Formato de token cifrado desconocido');
  const key = await getKey();
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(ivB64) }, key, fromBase64(dataB64));
  return new TextDecoder().decode(plain);
}

/** Comparación en tiempo constante (firmas HMAC, tokens de tarea). */
export function timingSafeEqual(a: string, b: string) {
  const left = new TextEncoder().encode(String(a));
  const right = new TextEncoder().encode(String(b));
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i++) diff |= left[i] ^ right[i];
  return diff === 0;
}

/** Bytes aleatorios en base64url (state OAuth, code_verifier PKCE). */
export function randomUrlSafe(bytes = 32) {
  return toBase64(crypto.getRandomValues(new Uint8Array(bytes)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/** code_challenge PKCE (S256) a partir del code_verifier. */
export async function pkceChallenge(verifier: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return toBase64(new Uint8Array(digest)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
