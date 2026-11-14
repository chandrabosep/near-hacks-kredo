import type { ComponentType, CSSProperties } from "react";
import NetworkAbstract from "@web3icons/react/icons/networks/NetworkAbstract";
import NetworkAptos from "@web3icons/react/icons/networks/NetworkAptos";
import NetworkArbitrumOne from "@web3icons/react/icons/networks/NetworkArbitrumOne";
import NetworkAvalanche from "@web3icons/react/icons/networks/NetworkAvalanche";
import NetworkBase from "@web3icons/react/icons/networks/NetworkBase";
import NetworkBerachain from "@web3icons/react/icons/networks/NetworkBerachain";
import NetworkBinanceSmartChain from "@web3icons/react/icons/networks/NetworkBinanceSmartChain";
import NetworkBitcoin from "@web3icons/react/icons/networks/NetworkBitcoin";
import NetworkEthereum from "@web3icons/react/icons/networks/NetworkEthereum";
import NetworkGnosis from "@web3icons/react/icons/networks/NetworkGnosis";
import NetworkHyperEvm from "@web3icons/react/icons/networks/NetworkHyperEvm";
import NetworkMonad from "@web3icons/react/icons/networks/NetworkMonad";
import NetworkNearProtocol from "@web3icons/react/icons/networks/NetworkNearProtocol";
import NetworkOptimism from "@web3icons/react/icons/networks/NetworkOptimism";
import NetworkPolygon from "@web3icons/react/icons/networks/NetworkPolygon";
import NetworkRobinhood from "@web3icons/react/icons/networks/NetworkRobinhood";
import NetworkScroll from "@web3icons/react/icons/networks/NetworkScroll";
import NetworkSolana from "@web3icons/react/icons/networks/NetworkSolana";
import NetworkStarknet from "@web3icons/react/icons/networks/NetworkStarknet";
import NetworkStellar from "@web3icons/react/icons/networks/NetworkStellar";
import NetworkSui from "@web3icons/react/icons/networks/NetworkSui";
import NetworkTon from "@web3icons/react/icons/networks/NetworkTon";
import NetworkTron from "@web3icons/react/icons/networks/NetworkTron";
import NetworkXLayer from "@web3icons/react/icons/networks/NetworkXLayer";
import TokenBTC from "@web3icons/react/icons/tokens/TokenBTC";
import TokenETH from "@web3icons/react/icons/tokens/TokenETH";
import TokenNEAR from "@web3icons/react/icons/tokens/TokenNEAR";
import TokenSOL from "@web3icons/react/icons/tokens/TokenSOL";
import TokenUSDC from "@web3icons/react/icons/tokens/TokenUSDC";
import TokenUSDT from "@web3icons/react/icons/tokens/TokenUSDT";
import { cn } from "@/lib/utils";

type Icon = ComponentType<{ size?: number | string; variant?: "branded" | "mono" | "background"; className?: string; style?: CSSProperties; "aria-hidden"?: boolean }>;
/** Inline sizes win over the `[&_svg]:size-4` rules in buttons and selects. */
const box = (size: number): CSSProperties => ({ width: size, height: size, flexShrink: 0 });

const TOKENS: Record<string, Icon> = {
  USDC: TokenUSDC,
  USDT: TokenUSDT,
  ETH: TokenETH,
  SOL: TokenSOL,
  BTC: TokenBTC,
  NEAR: TokenNEAR,
  wNEAR: TokenNEAR,
};

/** Keyed by 1Click's chain codes. */
const CHAINS: Record<string, Icon> = {
  abs: NetworkAbstract,
  aptos: NetworkAptos,
  arb: NetworkArbitrumOne,
  avax: NetworkAvalanche,
  base: NetworkBase,
  bera: NetworkBerachain,
  bsc: NetworkBinanceSmartChain,
  btc: NetworkBitcoin,
  eth: NetworkEthereum,
  gnosis: NetworkGnosis,
  hood: NetworkRobinhood,
  hypercore: NetworkHyperEvm,
  monad: NetworkMonad,
  near: NetworkNearProtocol,
  op: NetworkOptimism,
  pol: NetworkPolygon,
  scroll: NetworkScroll,
  sol: NetworkSolana,
  starknet: NetworkStarknet,
  stellar: NetworkStellar,
  sui: NetworkSui,
  ton: NetworkTon,
  tron: NetworkTron,
  xlayer: NetworkXLayer,
};

/** A letter in a circle, for a token or chain without a logo. */
function Fallback({ text, size }: { text: string; size: number }) {
  return (
    <span
      className="flex items-center justify-center rounded-full bg-kr-surface-2 font-semibold text-kr-text-2"
      style={{ width: size, height: size, fontSize: Math.max(8, Math.round(size * 0.42)) }}
      aria-hidden
    >
      {text.slice(0, 1).toUpperCase()}
    </span>
  );
}

/** A chain's logo, centred in a white disc so square and round logos look alike. */
export function ChainIcon({ chain, size = 16, className }: { chain: string; size?: number; className?: string }) {
  const C = CHAINS[chain];
  if (!C) return <span className={cn("inline-flex shrink-0 rounded-full", className)}><Fallback text={chain} size={size} /></span>;
  const inner = Math.round(size * 0.72);
  return (
    <span className={cn("inline-flex shrink-0 items-center justify-center rounded-full bg-white", className)} style={box(size)}>
      <C size={inner} variant="branded" style={box(inner)} aria-hidden />
    </span>
  );
}

/** A token's logo, with the chain it's on as a small badge in the corner. */
export function AssetIcon({ symbol, chain, size = 28, className }: { symbol: string; chain: string; size?: number; className?: string }) {
  const T = TOKENS[symbol];
  const badge = Math.round(size * 0.5);
  // The token and its chain share a logo (ETH on Ethereum, BTC on Bitcoin...): no badge needed.
  const native = (symbol === "ETH" && chain === "eth") || (symbol === "BTC" && chain === "btc") || (symbol === "SOL" && chain === "sol") || (symbol.endsWith("NEAR") && chain === "near");
  return (
    <span className={cn("relative inline-flex shrink-0", className)} style={{ width: size, height: size }}>
      {T ? <T size={size} variant="branded" style={box(size)} aria-hidden /> : <Fallback text={symbol} size={size} />}
      {!native && <ChainIcon chain={chain} size={badge} className="absolute -right-1 -bottom-1 border border-kr-border-light" />}
    </span>
  );
}
