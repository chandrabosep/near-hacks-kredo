import assert from "node:assert/strict";
import { test } from "node:test";
import { getAddress } from "viem";
import { AuthError, fromPrivyUser } from "../src/auth.js";

const embedded = (address: string, wallet_index = 0) => ({
  type: "wallet",
  address,
  chain_type: "ethereum",
  wallet_client_type: "privy",
  connector_type: "embedded",
  wallet_index,
});

test("takes the first Privy embedded Ethereum wallet and the email", () => {
  const user = {
    id: "did:privy:abc",
    linked_accounts: [
      { type: "email", address: "Alice@Example.com" },
      { type: "wallet", address: "0x00000000000000000000000000000000000000e0", chain_type: "ethereum", wallet_client_type: "metamask" },
      embedded("0x00000000000000000000000000000000000000b1", 1),
      embedded("0x00000000000000000000000000000000000000a0", 0),
    ],
  };
  const v = fromPrivyUser(user as never);
  assert.equal(v.privyId, "did:privy:abc");
  assert.equal(v.address, getAddress("0x00000000000000000000000000000000000000a0"));
  assert.equal(v.email, "alice@example.com");
});

test("ignores external wallets and Solana wallets", () => {
  const user = {
    id: "did:privy:x",
    linked_accounts: [
      { type: "wallet", address: "0x00000000000000000000000000000000000000e0", chain_type: "ethereum", wallet_client_type: "metamask" },
      { type: "wallet", address: "So1ana", chain_type: "solana", wallet_client_type: "privy" },
    ],
  };
  assert.throws(() => fromPrivyUser(user as never), AuthError);
});
