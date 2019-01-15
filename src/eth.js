const path = require('path')
const fs = require('fs')
const plasmaChainCompiled = require('plasma-contracts').plasmaChainCompiled
const plasmaRegistryCompiled = require('plasma-contracts').plasmaRegistryCompiled
const Web3 = require('web3')
const ganache = require('ganache-cli')
const log = require('debug')('info:eth')
const PLASMA_CHAIN_ADDRESS_FILENAME = require('./constants.js').PLASMA_CHAIN_ADDRESS_FILENAME

// `web3` & `plasmaChain` start as uninitialized because the startup script must be run before we can interact meaningfully with our node
let web3 = 'UNINITIALIZED'
let plasmaChain = 'UNINITIALIZED'
let operatorAddress = 'UNINITIALIZED'

async function startup (config) {
  // TODO: Remove this and replace with proper account management
  web3 = new Web3()
  _addTestWalletsToWeb3(web3)
  operatorAddress = web3.eth.accounts.wallet[0].address
  // Check if we are in test mode
  if (process.env.NODE_ENV === 'test') {
    await initializeTestingEnv(config)
  } else {
    await initializeProdEnv(config)
  }
  // Create our plasma chain web3 object, this will point to an existing Ethereum smart contract
  const plasmaChainAddress = fs.readFileSync(path.join(config.dbDir, PLASMA_CHAIN_ADDRESS_FILENAME), 'utf8')
  plasmaChain = new web3.eth.Contract(plasmaChainCompiled.abi, plasmaChainAddress)
  console.log('Using Plasma Chain at address:', plasmaChainAddress)
}

async function initializeTestingEnv (config) {
  // First get our web3 object which we will use. This comes with some wallets that have $ in them
  _setupTestProvider(web3)
  // Deploy a new Plasma Registry
  await deployNewPlasmaRegistry(config)
  // Deploy our new Plasma Chain and save it in a file
  const plasmaContractAddress = await deployNewPlasmaChain(web3, config)
  fs.writeFileSync(path.join(config.dbDir, PLASMA_CHAIN_ADDRESS_FILENAME), plasmaContractAddress)
}

async function deployNewPlasmaRegistry (config) {
  // Deploy a new PlasmaRegistry. This requires first deploying a dummy Plasma Chain
  // We have the compiled contracts, let's create objects for them...
  const plasmaChainCt = new web3.eth.Contract(plasmaChainCompiled.abi, operatorAddress, {from: operatorAddress, gas: 3500000, gasPrice: '300000'})
  const plasmaRegistryCt = new web3.eth.Contract(plasmaRegistryCompiled.abi, operatorAddress, {from: operatorAddress, gas: 3500000, gasPrice: '300000'})
  // To set up the Plasma Network, we need to first deploy a Plasma Chain contract
  const plasmaChain = await plasmaChainCt.deploy({ data: plasmaChainCompiled.bytecode }).send()
  // await mineBlock(web3)
  // Finally deploy the Plasma Registry and save the address in our config
  const plasmaRegistry = await plasmaRegistryCt.deploy({ data: plasmaRegistryCompiled.bytecode }).send()
  config.plasmaRegistryAddress = plasmaRegistry.options.address
  log('Deployed a Plasma Registry at', config.plasmaRegistryAddress)
  // await mineBlock(web3)
  // Initialize the registry
  await plasmaRegistry.methods.initializeRegistry(plasmaChain.options.address).send()
}

async function initializeProdEnv (config) {
  if (config.web3HttpProvider === undefined) {
    throw new Error('Web3 provider undefined!')
  }
  web3.setProvider(new Web3.providers.HttpProvider(config.web3HttpProvider))
  // Check if we need to deploy a new Plasma registry. TODO: Save the deployed registry address automatically
  if (config.plasmaRegistryAddress === 'NONE') {
    await deployNewPlasmaRegistry(config)
    console.log('Deployed new registry to address:', config.plasmaRegistryAddress, '--save this in your config')
  }
  // Check if we have a Plasma Contract already deployed
  const plasmaChainAddressPath = path.join(config.dbDir, PLASMA_CHAIN_ADDRESS_FILENAME)
  if (!fs.existsSync(plasmaChainAddressPath)) {
    // Check that the plasma registry was deployed
    const plasmaRegistryCode = await web3.eth.getCode(config.plasmaRegistryAddress)
    if (plasmaRegistryCode === '0x') {
      throw new Error('No plasma registry found at address: ' + config.plasmaRegistryAddress)
    }
    // Deploy a new Plasma Chain and save it in a file
    const plasmaContractAddress = await deployNewPlasmaChain(web3, config)
    console.log('No Plasma Chain detected! Created a new one at address:', plasmaContractAddress)
    fs.writeFileSync(path.join(config.dbDir, PLASMA_CHAIN_ADDRESS_FILENAME), plasmaContractAddress)
  }
}

async function deployNewPlasmaChain (web3, config) {
  // We have the compiled contracts, let's create objects for them...
  const plasmaRegistry = new web3.eth.Contract(plasmaRegistryCompiled.abi, config.plasmaRegistryAddress)
  const createPChainReciept = await plasmaRegistry.methods.createPlasmaChain(operatorAddress, Buffer.from(config.operatorIpAddress)).send({ from: operatorAddress, gas: 3500000, gasPrice: '300000' })
  const newPlasmaChainAddress = createPChainReciept.events.NewPlasmaChain.returnValues['0']
  log('Deployed a Plasma Chain at', newPlasmaChainAddress)
  return newPlasmaChainAddress
}

function _addTestWalletsToWeb3 (web3) {
  for (let i = 0; i < 100; i++) {
    web3.eth.accounts.wallet.add(web3.utils.sha3(i.toString()))
  }
}

function _setupTestProvider (web3) {
  const ganacheAccounts = []
  for (let i = 0; i < web3.eth.accounts.wallet.length; i++) {
    ganacheAccounts.push({
      balance: '0x99999999991',
      secretKey: web3.eth.accounts.wallet[i].privateKey
    })
  }
  // For all provider options, see: https://github.com/trufflesuite/ganache-cli#library
  const providerOptions = {'accounts': ganacheAccounts, 'locked': false, 'logger': { log }}
  web3.setProvider(ganache.provider(providerOptions))
  // TODO: Remove this as it is squashing errors. See https://github.com/ethereum/web3.js/issues/1648
  web3.currentProvider.setMaxListeners(300)
}

module.exports = {
  startup,
  web3,
  plasmaChain
}
