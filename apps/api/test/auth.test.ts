import assert from "node:assert/strict";
import { test } from "node:test";
import { KeyPair, type PublicKey } from "near-api-js";
import { AuthError, fromPrivyUser } from "../src/auth.js";

const key = () => KeyPair.fromRandom("ed25519").getPublicKey();
const hex = (k: PublicKey) => Buffer.from(k.data).toString("hex");

const nearWallet = (pub: PublicKey, wallet_index = 0, publicKey = true) => ({
  type: "wallet",
  address: hex(pub),
  chain_type: "near",
  wallet_client_type: "privy",
  connector_type: "embedded",
  public_key: publicKey ? hex(pub) : undefined,
  wallet_index,
});

test("takes the first Privy embedded NEAR wallet and the email", () => {
  const first = key();
  const second = key();
  const user = {
    id: "did:privy:abc",
    linked_accounts: [
      { type: "email", address: "Alice@Example.com" },
      { type: "wallet", address: "alice.near", chain_type: "near", wallet_client_type: "meteor" },
      nearWallet(second, 1),
      nearWallet(first, 0),
    ],
  };
  const v = fromPrivyUser(user);
  assert.equal(v.privyId, "did:privy:abc");
  assert.equal(v.address, hex(first), "the implicit account of the wallet's key");
  assert.equal(v.publicKey, first.toString());
  assert.equal(v.email, "alice@example.com");
});

test("an implicit account address alone is enough: it is the key", () => {
  const pub = key();
  const v = fromPrivyUser({ id: "did:privy:k", linked_accounts: [nearWallet(pub, 0, false)] });
  assert.equal(v.publicKey, pub.toString());
});

test("a key that doesn't match its implicit account is refused", () => {
  const w = nearWallet(key());
  w.public_key = hex(key());
  assert.throws(() => fromPrivyUser({ id: "did:privy:m", linked_accounts: [w] }), AuthError);
});

test("ignores external wallets and other chains", () => {
  const user = {
    id: "did:privy:x",
    linked_accounts: [
      { type: "wallet", address: "alice.near", chain_type: "near", wallet_client_type: "meteor" },
      { type: "wallet", address: "So1ana", chain_type: "solana", wallet_client_type: "privy" },
    ],
  };
  assert.throws(() => fromPrivyUser(user), AuthError);
});

test("an empty public key falls back to the implicit account", () => {
  const pub = key();
  const w = { ...nearWallet(pub), public_key: "" };
  assert.equal(fromPrivyUser({ id: "did:privy:e", linked_accounts: [w] }).publicKey, pub.toString());
});

test("a wallet with no usable key is a 401, not a crash", () => {
  const w = { ...nearWallet(key()), address: "alice.near", public_key: "" };
  assert.throws(() => fromPrivyUser({ id: "did:privy:n", linked_accounts: [w] }), AuthError);
});
