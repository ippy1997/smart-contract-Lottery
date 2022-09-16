const { developmentChains } = require("../helper-hardhat-config")
const { network, ethers } = require("hardhat")

// THOSE ARE THE CONSTRUCTOR ARGUMENTS FROM THE VRFv2 contact
const BASE_FEE = ethers.utils.parseEther("0.25") // 0.25 IS THE PREMIUIM IT COSTS 0.25 LINK PER REQUEST
const GAS_PRICE_LINK = 1e9 //1000000000 , //calculated value based on the gas price of the chain

module.exports = async function ({ getNamedAccounts, deployments }) {
    const { deploy, log } = deployments
    const { deployer } = await getNamedAccounts()
    const args = [BASE_FEE, GAS_PRICE_LINK]

    if (developmentChains.includes(network.name)) {
        log("local network detected , deploying mocks.....")

        // deploy a mock vrfCoordinator...
        await deploy("VRFCoordinatorV2Mock", {
            from: deployer,
            log: true,
            args: args,
        })
        log("Mocks Deployed!")
        log("--------------------------------------------")
    }
}

module.exports.tags = ["all", "mocks"]
