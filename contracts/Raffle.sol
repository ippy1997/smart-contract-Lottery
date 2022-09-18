// Lotttery
// Enter the lottery (paying some amount)
// Pick a random winner (verfiably random)
// Winner to be selected every X minutes -> completely automated
// ChainLink Oracle -> Randomness , Automamted Executions (ChainLink keepers)

// whenever we updated a dynamic object like an array or a mappiing we want to omit an event
// name the event with the function name reversed

// SPDX-License-Identifier: MIT

pragma solidity ^0.8.7;

import "@chainlink/contracts/src/v0.8/VRFConsumerBaseV2.sol";
import "@chainlink/contracts/src/v0.8/interfaces/VRFCoordinatorV2Interface.sol";
import "@chainlink/contracts/src/v0.8/interfaces/KeeperCompatibleInterface.sol";
error Raffle__NotEnoughETHEnterd();
error Raffle__TransferFailed();
error Raffle__NotOpen();
error Raffle__upkeepNotNeeded(uint256 currentBalance, uint256 numPlayers, uint256 raffestate);

/** @title A sample Raffle Contract
 * @author Anonymous
 * @notice this contract is for creaint an untamperable dectralized smart contract
 * @dev this implements ChainLink VRF v2 and ChainLink Keepers
 *
 */

contract Raffle is VRFConsumerBaseV2, KeeperCompatibleInterface {
    /* Type declaraions */
    //enums can be used to create custome types with a finite set of constant values

    enum RaffleState {
        OPEN,
        CALCULATING
    }

    /* State Variables */
    uint256 private immutable i_entranceFee;
    address payable[] private s_players;
    VRFCoordinatorV2Interface private immutable i_vrfCoordinator;
    bytes32 private immutable i_gasLane;
    uint64 private immutable i_subscriptionId;
    uint16 private constant REQUEST_CONFIRMATIONS = 3;
    uint32 private immutable i_callbackGaslimit;
    uint32 private constant NUM_WORDS = 1;

    // Lottery variables
    address private s_recentWinner;
    RaffleState private s_raffleState;
    uint256 private s_lastTimeStamp;
    uint256 private immutable i_interval;
    /* Events */
    // INDEXED PARAMERTARES : are searchable and easier to query
    event RaffleEnter(address indexed player);
    event RequestedRaffleWinner(uint256 indexed requestId);
    event WinnerPicked(address indexed winner); // to keep track of the recentWinenr

    /* functions */

    constructor(
        address vrfCoordinatorV2, //contract , therefor we need a mock
        uint256 entranceFee,
        bytes32 gasLane,
        uint64 subscriptionId,
        uint32 callbackGasLimit,
        uint256 interval
    ) VRFConsumerBaseV2(vrfCoordinatorV2) {
        i_entranceFee = entranceFee;
        //saving the vrfCoordinator in the address and wrap it with the interface
        i_vrfCoordinator = VRFCoordinatorV2Interface(vrfCoordinatorV2);
        i_gasLane = gasLane;
        i_subscriptionId = subscriptionId;
        i_callbackGaslimit = callbackGasLimit;
        s_raffleState = RaffleState.OPEN;
        s_lastTimeStamp = block.timestamp;
        i_interval = interval;
    }

    function enterRaffle() public payable {
        // require msg.value >  i_enteranceFee
        if (msg.value < i_entranceFee) {
            revert Raffle__NotEnoughETHEnterd();
        }
        if (s_raffleState != RaffleState.OPEN) {
            revert Raffle__NotOpen();
        }
        s_players.push(payable(msg.sender));
        //emit an event
        emit RaffleEnter(msg.sender);
    }

    // checkUpKeep function is checking if it is time to get a random number
    /**
     * @dev this is the function that the chainLink keeper node calls
     * they look for the `upKeepNeeded` to return true
     * the following should be true in order to return true:
     * 1. Our time interval should have passed
     * 2. lottery should have atleast 1 player , and have some ETH
     * 3. Our subscription is funded with link
     * 4. lottery should be an "open" state
     */
    function checkUpkeep(
        bytes memory /*checkData*/
    )
        public
        override
        returns (
            bool upkeepNeeded,
            bytes memory /* perfomrData*/
        )
    {
        // this will be true if our state is open
        bool isOpen = (RaffleState.OPEN == s_raffleState);
        // to check the time , we use (block.timestamp - last block timestamp) > interval to the get the current timestamp
        bool timePassed = ((block.timestamp - s_lastTimeStamp) > i_interval);
        // check to see if we have enough players
        bool hasPlayers = (s_players.length > 0);
        // check if we have balance
        bool hasBalance = address(this).balance > 0;
        // turn all these variables to a return variable
        upkeepNeeded = (isOpen && timePassed && hasPlayers && hasBalance);
    }

    function performUpkeep(
        bytes calldata /*perfomeData*/
    ) external override {
        (bool upkeepNeeded, ) = checkUpkeep("");
        if (!upkeepNeeded) {
            revert Raffle__upkeepNotNeeded(
                address(this).balance,
                s_players.length,
                uint256(s_raffleState)
            );
        }
        // request the randome number from the VRF
        // once we get it , do something with it
        // 2 transaction process
        s_raffleState = RaffleState.CALCULATING;
        uint256 requestId = i_vrfCoordinator.requestRandomWords(
            i_gasLane, // gasLane keyHash is a max price willing to be paid for gas in wei
            i_subscriptionId, //The subscription ID that this contract uses for funding requests
            REQUEST_CONFIRMATIONS, // How many confirmations the Chainlink node should wait before responding
            i_callbackGaslimit, //  The limit for how much gas to use for the callback request to your contract's fulfillRandomWords() function
            NUM_WORDS //  How many random values to request
        );
        emit RequestedRaffleWinner(requestId);
    }

    function fulfillRandomWords(
        uint256, /*requestId*/
        uint256[] memory randomWords
    ) internal override {
        // s_players array size 10
        // the random number is 200 , to sort this issue we us the mod opreator
        // we make an index of randome winners and get the randomWords[0] becasue we requested 1 radnomeNumber from vrf
        // then we mod that with s_players array length to get a proper round number in our arrays range
        // the we get the winner s_player[indexeOfWinner] and store it in a variable to know the recent winner
        uint256 indexeOfWinner = randomWords[0] % s_players.length;
        address payable recentWinner = s_players[indexeOfWinner];
        s_recentWinner = recentWinner;
        // AFTER WE PICK A WINNER WE reset THE STATE TO OPEN FOR NEW PLAYERS TO JOIN
        s_raffleState = RaffleState.OPEN;
        // AFTER SELECTING A WINNER RESET THE PLAYERS ARRAY
        s_players = new address payable[](0);
        // Reset TimeStamp
        s_lastTimeStamp = block.timestamp;
        // sending the money to the winner of the lottery
        (bool success, ) = recentWinner.call{value: address(this).balance}("");
        if (!success) {
            revert Raffle__TransferFailed();
        }
        emit WinnerPicked(recentWinner);
    }

    /*view / pure functions*/
    function getEntranceFee() public view returns (uint256) {
        return i_entranceFee;
    }

    function getPlayer(uint256 index) public view returns (address) {
        return s_players[index];
    }

    function getRecentWinner() public view returns (address) {
        return s_recentWinner;
    }

    function getRaffleState() public view returns (RaffleState) {
        return s_raffleState;
    }

    function getNumWords() public pure returns (uint256) {
        return NUM_WORDS;
    }

    function getNumberOfPlayer() public view returns (uint256) {
        return s_players.length;
    }

    function getLatestTimeStamp() public view returns (uint256) {
        return s_lastTimeStamp;
    }

    function getRequestCofirmations() public pure returns (uint256) {
        return REQUEST_CONFIRMATIONS;
    }

    function getInterval() public view returns (uint256) {
        return i_interval;
    }
}

