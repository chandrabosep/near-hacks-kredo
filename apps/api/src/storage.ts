/**
 * Vault storage (NEP-145), paid by the relayer. The vault refuses to hold credits for an account
 * nobody registered, and takes the state a user's own calls add (a new app limit, a new claim
 * link) from that user's storage balance. Users never hold NEAR, so the relayer registers them
 * and keeps a little headroom on their balance.
 *
 * - Register once, with the minimum plus `headroom`, before anything credits or writes for them.
 * - Before a call that adds state, top up by `topUp` when what's available is below `topUpBelow`.
 * - Registration can't be undone on the vault, so accounts seen registered are remembered.
 * - One account's checks run one at a time, so the same account is never registered twice.
 */
import type { AccountId } from "./near.js";
import type { Relayer } from "./relayer.js";
import type { Vault } from "./vault.js";

/** In yoctoNEAR. */
export type StoragePolicy = {
  /** Paid above the vault's minimum when registering, for the account's own state later. */
  headroom: bigint;
  /** Top up when an account's available storage is below this before a call that adds state. */
  topUpBelow: bigint;
  /** How much one top-up adds. */
  topUp: bigint;
};

export function createStorage(opts: { vault: Vault; relayer: Relayer; policy: StoragePolicy }) {
  const { vault, relayer, policy } = opts;
  const registered = new Set<AccountId>();
  const locks = new Map<AccountId, Promise<unknown>>();
  let min: bigint | undefined;

  /** Runs `job` after every earlier job for `account` has finished. */
  function locked<T>(account: AccountId, job: () => Promise<T>): Promise<T> {
    const run = (locks.get(account) ?? Promise.resolve()).then(job, job);
    const tail = run.catch(() => undefined);
    locks.set(account, tail);
    // Forget the account once nothing more is queued for it.
    void tail.then(() => locks.get(account) === tail && locks.delete(account));
    return run;
  }

  const deposit = (account: AccountId, amount: bigint) =>
    relayer.write({ method: "storage_deposit", args: { account_id: account, registration_only: false }, deposit: amount });

  async function register(account: AccountId) {
    min ??= await vault.storageMin();
    await deposit(account, min + policy.headroom);
    registered.add(account);
  }

  async function headroom(account: AccountId) {
    const balance = await vault.storageOf(account);
    if (!balance) return register(account);
    registered.add(account);
    if (balance.available < policy.topUpBelow) await deposit(account, policy.topUp);
  }

  return {
    /** Registers `account` on the vault unless it already is. */
    async ensureRegistered(account: AccountId): Promise<void> {
      if (registered.has(account)) return;
      await locked(account, async () => {
        if (registered.has(account)) return;
        if (await vault.storageOf(account)) registered.add(account);
        else await register(account);
      });
    },

    /** Tops `account` up, registering it first if need be, so it can pay for one more entry of its own state. */
    ensureHeadroom: (account: AccountId): Promise<void> => locked(account, () => headroom(account)),

    /**
     * `ensureHeadroom`, then `job`, before any other check for the same account. Two calls from
     * one user can't both pass on the same headroom and leave the second short.
     */
    withHeadroom: <T>(account: AccountId, job: () => Promise<T>): Promise<T> =>
      locked(account, async () => {
        await headroom(account);
        return job();
      }),
  };
}

export type Storage = ReturnType<typeof createStorage>;
