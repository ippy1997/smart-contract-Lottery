// grab our dev chains , so we only run a unit test on a development chain
//getNamedAccounts are used for getting public key for accounts in hardhat config
//  beforeEach() is run before each test in a describe
const { assert, expect } = require("chai")
const { network, getNamedAccounts, deployments, ethers } = require("hardhat")
const { etherscan } = require("../../hardhat.config")
const { developmentChains, networkConfig } = require("../../helper-hardhat-config")

!developmentChains.includes(network.name)
    ? describe.skip
    : describe("Raffle", function () {
          let raffle, vrfCoordinatorV2Mock, raffleEntranceFee, deployer, interval
          const chainId = network.config.chainId

          beforeEach(async function () {
              deployer = (await getNamedAccounts()).deployer
              // deploying our contracts that has the "all" tag
              await deployments.fixture(["all"])
              // getting the contract
              raffle = await ethers.getContract("Raffle", deployer)
              vrfCoordinatorV2Mock = await ethers.getContract("VRFCoordinatorV2Mock", deployer)
              raffleEntranceFee = await raffle.getEntranceFee()
              interval = await raffle.getInterval()
          })

          // testing the constructor
          describe("constructor", () => {
              it("initializes the raffle correctly", async () => {
                  // normally we have 1 assert per it
                  const raffleState = await raffle.getRaffleState()
                  // assert. equal() method tests if two values are equal, using the == operator
                  // our raffle state will be a big number so we stringify it
                  // checking if the raffle state is = 0
                  assert.equal(raffleState.toString(), "0")
                  // checking if the intreval is = to what we set it to be in our helper file
                  assert.equal(interval.toString(), networkConfig[chainId]["interval"])
              })
          })

          describe("enterRaffle", () => {
              it("should revert when you dont have enough eth", async () => {
                  await expect(raffle.enterRaffle()).to.be.revertedWith(
                      "Raffle__NotEnoughETHEnterd"
                  )
              })

              it("records players when they enter", async () => {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  const playerFromContract = await raffle.getPlayer(0)
                  assert.equal(playerFromContract, deployer)
              })

              it("emmits an event on entering", async () => {
                  await expect(raffle.enterRaffle({ value: raffleEntranceFee })).to.emit(
                      raffle,
                      "RaffleEnter"
                  )
              })

              it("doesnt allow entrance when raffle is calculating ", async () => {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  // time travel to escape the interval wait time
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  // after skipping the interval wait time we need to mine a block
                  await network.provider.send("evm_mine", [])
                  // pretend to be a chainlink keeper
                  await raffle.performUpkeep([])
                  await expect(raffle.enterRaffle({ value: raffleEntranceFee })).to.be.revertedWith(
                      "Raffle__NotOpen"
                  )
              })
          })

          describe("check upkeep", () => {
              it("returns false if people havent sent any eth", async () => {
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.send("evm_mine", [])
                  const { upkeepNeeded } = await raffle.callStatic.checkUpkeep([])
                  assert(!upkeepNeeded)
              })

              it("returns false if raffle is not open", async () => {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.send("evm_mine", [])
                  // 0x to rep bytes object or an empty [] both are the same
                  await raffle.performUpkeep([])
                  const raffleState = await raffle.getRaffleState()
                  const { upkeepNeeded } = await raffle.callStatic.checkUpkeep([])
                  assert.equal(raffleState.toString(), "1")
                  assert.equal(upkeepNeeded, false)
              })

              it("returns false if enough time hasn't passed", async () => {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() - 5]) // use a higher number here if this test fails
                  await network.provider.request({ method: "evm_mine", params: [] })
                  const { upkeepNeeded } = await raffle.callStatic.checkUpkeep("0x") // upkeepNeeded = (timePassed && isOpen && hasBalance && hasPlayers)
                  assert(!upkeepNeeded)
              })

              it("returns true if enough time has passed, has players, eth, and is open", async () => {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.request({ method: "evm_mine", params: [] })
                  const { upkeepNeeded } = await raffle.callStatic.checkUpkeep("0x") // upkeepNeeded = (timePassed && isOpen && hasBalance && hasPlayers)
                  assert(upkeepNeeded)
              })
          })

          describe("performUpKeep", () => {
              it("it can only run if checkupKeep is true", async () => {
                  // entering raffle with the amount
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  // bypass the time interval
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.send("evm_mine", [])

                  const tx = await raffle.performUpkeep("0x")
                  assert(tx)
              })

              it("reverts when checkUpKeep is false", async () => {
                  await expect(raffle.performUpkeep([])).to.be.revertedWith(
                      "Raffle__upkeepNotNeeded"
                  )
              })

              it("updates the raffle state , emits and event , and calls the vrf coordinatior", async () => {
                  // MAKING checkUpKeep TRUE
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.send("evm_mine", [])

                  // CALLING performUpKeep
                  const txResponce = await raffle.performUpkeep("0x")
                  const txReceipt = await txResponce.wait(1)
                  // [1] event emitted
                  const requestId = txReceipt.events[1].args.requestId

                  const raffleState = await raffle.getRaffleState()
                  assert(requestId.toNumber() > 0)
                  assert(raffleState.toString() == "1")
              })
          })

          describe("fullfillRandomWords", () => {
              beforeEach(async () => {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.send("evm_mine", [])
              })

              it("can only be called after performUpKeep", async () => {
                  await expect(
                      vrfCoordinatorV2Mock.fulfillRandomWords(0, raffle.address)
                  ).to.be.revertedWith("nonexistent request")

                  await expect(
                      vrfCoordinatorV2Mock.fulfillRandomWords(1, raffle.address)
                  ).to.be.revertedWith("nonexistent request")
              })

              // the big test
              it("picks a winner , resest the lottery , and sends money", async () => {
                  const additonalEnternace = 3
                  const startingAccountIndex = 2 // deployer = 0
                  const accounts = await ethers.getSigners()

                  // connecting 3 extra people to the rafffle , not including the deployer which makes it 4
                  for (
                      let i = startingAccountIndex;
                      i < startingAccountIndex + additonalEnternace;
                      i++
                  ) {
                      const accountConnectedRaffle = raffle.connect(accounts[i])
                      await accountConnectedRaffle.enterRaffle({ value: raffleEntranceFee })
                  }
                  const startingTimeStamp = await raffle.getLatestTimeStamp()

                  // performUpKeep {mock being chainLink keepers}
                  // fullfillRandomWords {mock being the chainLink VRF}
                  // IF WE ON TESTNET : we have to wait for the fullfillRandomWords
                  await new Promise(async (resolve, reject) => {
                      // Listening for the winnerPicked Event
                      raffle.once("WinnerPicked", async () => {
                          console.log("Found the event")

                          try {
                              const recentWinner = await raffle.getRecentWinner()
                              console.log(`the Last winner was : ${recentWinner}`)

                              console.log(
                                  "------------------------All Accounts------------------------"
                              )
                              console.log(accounts[0].address)
                              console.log(accounts[1].address)
                              console.log(accounts[2].address)
                              console.log(accounts[3].address)

                              const raffleState = await raffle.getRaffleState()
                              const endingTimeStamp = await raffle.getLatestTimeStamp()
                              const numPlayers = await raffle.getNumberOfPlayer()
                              const winnerEndingBalance = await accounts[2].getBalance()

                              // asserts
                              assert.equal(numPlayers.toString(), "0")
                              assert.equal(raffleState.toString(), "0")
                              assert(endingTimeStamp > startingTimeStamp)

                              // doing the math to make sure the winner gets the right amount

                              assert.equal(
                                  winnerEndingBalance.toString(),
                                  winnerStartingBalace
                                      .add(
                                          raffleEntranceFee
                                              .mul(additonalEnternace)
                                              .add(raffleEntranceFee)
                                      )
                                      .toString()
                              )
                          } catch (error) {
                              reject(error)
                          }
                          resolve()
                      })
                      // setting up a listener

                      // below , we will fire the event , and the listner will pick it up , and resolve
                      const tx = await raffle.performUpkeep([])
                      const txReceipt = await tx.wait(1)
                      const winnerStartingBalace = await accounts[2].getBalance()
                      await vrfCoordinatorV2Mock.fulfillRandomWords(
                          txReceipt.events[1].args.requestId,
                          raffle.address
                      )
                  })
              })
          })
      })
