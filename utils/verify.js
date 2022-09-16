const { run } = require("hardhat")

const verify = async (contractAdress, args) => {
    console.log("verifying contract ..........")
    try {
        await run("verify:verify", {
            address: contractAdress,
            construcutorArguments: args,
        })
    } catch (e) {
        if (e.message.toLowerCase().includes("already verified")) {
            console.log("contract already verified")
        } else {
            console.log(e)
        }
    }
}

module.exports = { verify }
