// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {Deploy} from "../script/Deploy.s.sol";

contract DeployTest is Test {
    Deploy script = new Deploy();
    address constant OFFICIAL = 0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7;

    function test_resolveUsdt_whitechainDefaultsToOfficial() public view {
        assertEq(script.resolveUsdt(1874, address(0)), OFFICIAL);
        assertEq(script.resolveUsdt(1874, OFFICIAL), OFFICIAL);
    }

    /// A self-minted token on Whitechain doesn't count as a USDT payment. Refuse it.
    function test_resolveUsdt_whitechainRefusesOtherTokens() public {
        address fake = makeAddr("fakeUsdt");
        vm.expectRevert(abi.encodeWithSelector(Deploy.WrongUsdtOnWhitechain.selector, fake));
        script.resolveUsdt(1874, fake);
    }

    function test_resolveUsdt_localUsesOverrideOrMock() public {
        address local = makeAddr("localUsdt");
        assertEq(script.resolveUsdt(31337, local), local);
        assertEq(script.resolveUsdt(31337, address(0)), address(0));
    }
}
