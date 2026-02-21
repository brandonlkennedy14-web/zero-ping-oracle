// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title ZeroPingOracle
 * @dev A high-speed state channel settlement contract for deterministic arcade games.
 */
contract ZeroPingOracle {
    
    address public trustedOracle; // The public address of your off-chain game server
    uint256 public matchCounter;

    struct Match {
        address player1;
        address player2;
        uint256 wager;
        address winner;
        bool isResolved;
    }

    mapping(uint256 => Match) public matches;

    // Events to let the frontend know what's happening
    event MatchCreated(uint256 indexed matchId, address player1, address player2, uint256 wager);
    event MatchStarted(uint256 indexed matchId);
    event MatchResolved(uint256 indexed matchId, address winner, uint256 payout);

    // Set the Oracle's public address when deploying
    constructor(address _trustedOracle) {
        trustedOracle = _trustedOracle;
    }

    /**
     * @dev Player 1 creates a match and locks in their wager.
     */
    function createMatch(address _player2) external payable returns (uint256) {
        require(msg.value > 0, "Must wager some tokens to race");
        require(_player2 != address(0) && _player2 != msg.sender, "Invalid opponent");

        matchCounter++;
        uint256 matchId = matchCounter;

        matches[matchId] = Match({
            player1: msg.sender,
            player2: _player2,
            wager: msg.value,
            winner: address(0),
            isResolved: false
        });

        emit MatchCreated(matchId, msg.sender, _player2, msg.value);
        return matchId;
    }

    /**
     * @dev Player 2 accepts the match by matching the exact wager.
     */
    function acceptMatch(uint256 _matchId) external payable {
        Match storage m = matches[_matchId];
        require(msg.sender == m.player2, "You were not challenged to this race");
        require(msg.value == m.wager, "Must match the exact wager amount");
        require(!m.isResolved, "Match already finished");

        emit MatchStarted(_matchId);
    }

    /**
     * @dev The Oracle submits the final result to unlock the funds.
     * We use ECDSA signature recovery to prove the Oracle authorized this winner.
     */
    function resolveMatch(
        uint256 _matchId, 
        address _winner, 
        bytes memory _oracleSignature
    ) external {
        Match storage m = matches[_matchId];
        require(!m.isResolved, "Match already resolved");
        require(_winner == m.player1 || _winner == m.player2, "Winner must be a player in the match");

        // 1. Recreate the exact hash the Oracle signed
        bytes32 messageHash = keccak256(abi.encodePacked(_matchId, _winner));
        
        // 2. Add standard Ethereum prefix to prevent cross-protocol replay attacks
        bytes32 ethSignedMessageHash = keccak256(
            abi.encodePacked("\x19Ethereum Signed Message:\n32", messageHash)
        );

        // 3. Recover the signer's address from the signature
        address recoveredSigner = recoverSigner(ethSignedMessageHash, _oracleSignature);
        
        // 4. Verify it was actually our trusted off-chain game server
        require(recoveredSigner == trustedOracle, "INVALID ORACLE SIGNATURE: Cheat detected");

        // 5. Settle the Ledger
        m.isResolved = true;
        m.winner = _winner;
        uint256 totalPot = m.wager * 2; // Winner takes all

        // Pay the winner
        (bool success, ) = payable(_winner).call{value: totalPot}("");
        require(success, "Transfer failed");

        emit MatchResolved(_matchId, _winner, totalPot);
    }

    /**
     * @dev Cryptographic helper to split the signature (v, r, s) and recover the address
     */
    function recoverSigner(bytes32 _ethSignedMessageHash, bytes memory _signature) 
        internal pure returns (address) 
    {
        require(_signature.length == 65, "Invalid signature length");

        bytes32 r; bytes32 s; uint8 v;

        assembly {
            r := mload(add(_signature, 32))
            s := mload(add(_signature, 64))
            v := byte(0, mload(add(_signature, 96)))
        }

        return ecrecover(_ethSignedMessageHash, v, r, s);
    }
}