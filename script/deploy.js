const hre = require("hardhat");
const {expect} = require("chai");
const config = require("./deploy-config.json");

async function main() {
    const [owner, userAddr] = await hre.ethers.getSigners();
    console.log("owner adress:", owner.address)
    let weth9
    let router
    let factory
    let pairs = []
    //deploy UniswapV2Factory
    {
        const Factory = await hre.ethers.getContractFactory("UniswapV2Factory");
        factory = await Factory.deploy(owner.address)
        await factory.deployed();
        console.log("factory:", factory.address)
    }
    //deploy WETH9
    {
        const WETH9 = await hre.ethers.getContractFactory("WETH9");
        weth9 = await WETH9.deploy()
        await weth9.deployed();
        console.log("WETH9:", weth9.address)
    }
    //deploy UniswapV2Router02
    {
        const UniswapV2Library = await hre.ethers.getContractFactory("UniswapV2Library");
        const uniswapV2Library = await UniswapV2Library.deploy()
        await uniswapV2Library.deployed();
        console.log("uniswapV2Library addr:", uniswapV2Library.address)

        //const UniswapV2Router02 = await hre.ethers.getContractFactory("UniswapV2Router02", {
        //    libraries: {
        //        UniswapV2Library: uniswapV2Library.address
        //    }
        //})
        const UniswapV2Router02 = await hre.ethers.getContractFactory("UniswapV2Router02")
        const uniswapV2Router02 = await UniswapV2Router02.deploy(factory.address, weth9.address)
        await uniswapV2Router02.deployed();
        console.log("UniswapV2Router02:", uniswapV2Router02.address)
        router = uniswapV2Router02
    }
    // deploy erc20 address
    let erc20Addresses = []
    let erc20Instances = []
    {
        const ERC20 = await hre.ethers.getContractFactory("ERC20");
        const totalSupply = 100000000000000000000000000000000000000n;
        for (let index = 0; index < config.numPairs * 2; index++) {
            let erc20 = await ERC20.deploy(totalSupply)
            await erc20.deployed();
            //console.log("index:", index, ", erc20 addr:", erc20.address)
            await erc20.approve(router.address, totalSupply)
            erc20Addresses.push(erc20.address)
            erc20Instances.push(erc20)
        }
    }
    // distribute eth to user address
    {
        let numAddresses = config.numAddresses
        for (let index = 0; index < numAddresses; index++) {
            const path = `m/44'/60'/0'/0/${index}`; // 派生路径
            const wallet = hre.ethers.Wallet.fromMnemonic(config.mnemonic, path); // 使用助记词和派生路径创建钱包
            let to = wallet.address
            //console.log(`索引 ${index} 的钱包地址:`, wallet.address);
            await owner.sendTransaction({"from": owner.address,
                "to": to,
                gasLimit: 100000,
                gasPrice: 15000000000,
                value: hre.ethers.utils.parseEther("50"),
            })

            // distribute erc20 to user address
            const amount= 10000000000000000000000000000n;
            for (let i = 0; i < erc20Instances.length; i++) {
                let erc20 = erc20Instances[i]
                await erc20.transfer(to, amount)
                {
                    const signer = wallet.connect(hre.ethers.provider);
                    let erc20I = await hre.ethers.getContractAt("ERC20", erc20.address, signer)
                    await erc20I.approve(router.address, amount)
                }
            }
        }
    }
    // deploy pair
    {
        if (erc20Addresses.length != config.numPairs * 2) {
            console.log("some thing is unexpected, err: pair.length != config.numPairs * 2")
            return
        }
        for (let index = 0; index < config.numPairs * 2; index = index+2) {
            let tokenA = erc20Addresses[index]
            let tokenB = erc20Addresses[index+1]

            const amountADesired = 10000000000000000000000000000n;
            const amountBDesired = 20000000000000000000000000000n;
            let deadline = 2734595582
            await router.addLiquidity(tokenA, tokenB, amountADesired, amountBDesired, 0, 0, owner.address, deadline);
            let pair = await factory.getPair(tokenA, tokenB)
            console.log("pair:", pair)
            pairs.push(pair)
        }
    }
    //distribute erc20 to user addr
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
