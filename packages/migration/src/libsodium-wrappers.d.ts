declare module 'libsodium-wrappers' {
  interface Libsodium {
    readonly ready: Promise<void>;
    readonly base64_variants: { readonly ORIGINAL: number };
    from_base64(value: string, variant: number): Uint8Array;
    from_string(value: string): Uint8Array;
    to_string(value: Uint8Array): string;
    crypto_box_keypair(): {
      readonly publicKey: Uint8Array;
      readonly privateKey: Uint8Array;
    };
    crypto_box_seal(message: Uint8Array, publicKey: Uint8Array): Uint8Array;
    crypto_box_seal_open(
      ciphertext: Uint8Array,
      publicKey: Uint8Array,
      privateKey: Uint8Array,
    ): Uint8Array;
    to_base64(value: Uint8Array, variant: number): string;
  }

  const sodium: Libsodium;
  export default sodium;
}
