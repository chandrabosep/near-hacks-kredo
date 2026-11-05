// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Script, console} from "forge-std/Script.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {CreditVault} from "../src/CreditVault.sol";
import {MockUSDT} from "../src/mocks/MockUSDT.sol";

/// @notice Deploys CreditVault and writes the addresses to deployments/<chainId>.json.
///
/// Local (deploys MockUSDT too):
///   forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --broadcast \
///     --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
///
/// Whitechain Sepolia (always the official test USDT):
///   OPERATOR=0x... FEE_RECIPIENT=0x... forge script script/Deploy.s.sol \
///     --rpc-url whitechain_sepolia --account deployer --broadcast \
///     --verify --verifier blockscout --verifier-url https://explorer.testnet.whitechain.io/api/
///
/// Optional env: OWNER, OPERATOR, FEE_RECIPIENT (default: the deployer), USDT (local only).
contract Deploy is Script {
    uint256 public constant WHITECHAIN_SEPOLIA = 1874;
    address public constant WHITECHAIN_USDT = 0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7;

    error MockOnWhitechain();
    error WrongUsdtOnWhitechain(address given);

    function run() external returns (CreditVault vault, address usdt) {
        vm.startBroadcast();
        (, address deployer,) = vm.readCallers();

        address owner = vm.envOr("OWNER", deployer);
        address operator = vm.envOr("OPERATOR", deployer);
        address feeRecipient = vm.envOr("FEE_RECIPIENT", deployer);

        usdt = resolveUsdt(block.chainid, vm.envOr("USDT", address(0)));
        if (usdt == address(0)) {
            if (block.chainid == WHITECHAIN_SEPOLIA) revert MockOnWhitechain();
            usdt = address(new MockUSDT());
            console.log("MockUSDT:", usdt);
        }

        vault = new CreditVault(IERC20Metadata(usdt), owner, operator, feeRecipient);
        vm.stopBroadcast();

        console.log("CreditVault:", address(vault));
        console.log("USDT:", usdt);
        console.log("Owner:", owner);
        console.log("Operator:", operator);
        console.log("FeeRecipient:", feeRecipient);
        _write(vault, usdt, owner, operator, feeRecipient);
    }

    /// @notice Which USDT to use. On Whitechain Sepolia it is always the official token: payments
    /// in a self-minted token don't count. Elsewhere, the override or address(0) for a fresh mock.
    function resolveUsdt(uint256 chainId, address override_) public pure returns (address) {
        if (chainId == WHITECHAIN_SEPOLIA) {
            if (override_ != address(0) && override_ != WHITECHAIN_USDT) revert WrongUsdtOnWhitechain(override_);
            return WHITECHAIN_USDT;
        }
        return override_;
    }

    function _write(CreditVault vault, address usdt, address owner, address operator, address feeRecipient) internal {
        string memory key = "deployment";
        vm.serializeUint(key, "chainId", block.chainid);
        vm.serializeUint(key, "deployBlock", block.number);
        vm.serializeAddress(key, "usdt", usdt);
        vm.serializeAddress(key, "owner", owner);
        vm.serializeAddress(key, "operator", operator);
        vm.serializeAddress(key, "feeRecipient", feeRecipient);
        string memory json = vm.serializeAddress(key, "creditVault", address(vault));
        string memory path = string.concat(vm.projectRoot(), "/deployments/", vm.toString(block.chainid), ".json");
        vm.writeJson(json, path);
        console.log("Wrote", path);
    }
}
