// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @notice The EIP-3009 entry point the Whitechain test USDT (TetherTokenV2) exposes.
/// The token requires `to == msg.sender`, so only the payee can submit it.
interface IERC3009 {
    function receiveWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;
}
