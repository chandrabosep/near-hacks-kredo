/** Starts a throwaway anvil chain with MockUSDT and CreditVault deployed from contracts/out. */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, http, type Address, type Hex } from "viem";
import { creditVaultAbi } from "../src/abi/CreditVault.js";
import { mockUSDTAbi } from "../src/abi/MockUSDT.js";
import { createClients, type Clients } from "../src/chain.js";

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, "../../../contracts/out");

export const ANVIL_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as Hex;

/** Why the chain tests can't run here, or false when they can. */
export const skipChainTests: string | false =
  spawnSync("anvil", ["--version"]).status !== 0
    ? "needs anvil"
    : !existsSync(join(out, "CreditVault.sol/CreditVault.json"))
      ? "needs `forge build` in contracts/"
      : false;

export type LocalChain = {
  rpcUrl: string;
  clients: Clients;
  usdt: Address;
  vault: Address;
  stop(): void;
};

function bytecode(name: string): Hex {
  return JSON.parse(readFileSync(join(out, `${name}.sol/${name}.json`), "utf8")).bytecode.object;
}

export async function startLocalChain(): Promise<LocalChain> {
  const port = 20_000 + Math.floor(Math.random() * 20_000);
  const rpcUrl = `http://127.0.0.1:${port}`;
  const anvil: ChildProcess = spawn("anvil", ["--port", String(port), "--silent"], { stdio: "ignore" });

  const probe = createPublicClient({ transport: http(rpcUrl) });
  for (let i = 0; ; i++) {
    try {
      await probe.getChainId();
      break;
    } catch {
      if (i > 50) throw new Error("anvil did not start");
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  const clients = createClients({ chainId: 31337, rpcUrl, operatorKey: ANVIL_KEY });
  const { walletClient, publicClient, operator } = clients;
  const usdtHash = await walletClient.deployContract({ abi: mockUSDTAbi, bytecode: bytecode("MockUSDT") });
  const usdt = (await publicClient.waitForTransactionReceipt({ hash: usdtHash })).contractAddress!;
  const vaultHash = await walletClient.deployContract({
    abi: creditVaultAbi,
    bytecode: bytecode("CreditVault"),
    args: [usdt, operator.address, operator.address, operator.address],
  });
  const vault = (await publicClient.waitForTransactionReceipt({ hash: vaultHash })).contractAddress!;

  return { rpcUrl, clients, usdt, vault, stop: () => anvil.kill() };
}
